-- ============================================================================
-- 0048 -- Limite de taxa com contador compartilhado
--
-- P1-3 da auditoria de 11/09. `lib/rate-limit.ts` guardava os baldes num `Map`
-- por processo, e o proprio arquivo registrava a consequencia: em serverless
-- (Vercel) cada instancia conta sozinha, e o limite efetivo vira
-- `limite x instancias quentes` -- um numero que nenhum codigo controla. As sete
-- rotas de `/api/` limitadas por ele, entre elas as duas que autenticam por
-- segredo compartilhado, nao tinham limite exato nenhum.
--
-- POR QUE POSTGRES, E NAO UM SERVICO NOVO -- o volume esperado e de uma
-- integracao conhecida e 34 usuarios. Uma chamada a mais ao banco por
-- requisicao limitada custa menos que operar Redis/Upstash, e o banco ja esta
-- no caminho de quase todas essas rotas.
--
-- JANELA FIXA, IGUAL AO QUE EXISTIA -- a troca e de onde o contador mora, nao
-- de algoritmo. Os limites configurados nas rotas continuam significando a
-- mesma coisa; so passam a valer de verdade.
--
-- SO A SERVICE_ROLE CHEGA AQUI -- nem `anon` nem `authenticated` leem a tabela
-- ou executam a funcao. Se `anon` pudesse chamar `consumir_limite_de_taxa` pelo
-- `/rest/v1/rpc`, qualquer pessoa com a anon key (que esta no bundle e no APK)
-- esgotaria o balde de outra rota ou de outro IP e derrubaria a rota com 429.
-- O limitador viraria a propria ferramenta de negacao de servico.
--
-- A CHAVE CHEGA COM HASH -- a rota compoe `rota:ip` e o servidor manda o
-- sha256 disso. Nenhum IP cru fica gravado (dado pessoal, ver
-- `docs/lgpd-privacidade.md`), e a linha some sozinha pouco depois de a janela
-- vencer.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================================

create table if not exists public.limites_de_taxa (
  chave text primary key,
  contagem integer not null,
  expira_em timestamptz not null,
  constraint limites_de_taxa_chave_e_hash check (chave ~ '^[0-9a-f]{64}$')
);

comment on table public.limites_de_taxa is
  'Contador de janela fixa das rotas de /api/ (0048). Uma linha por balde;
   `chave` e sha256 hex de `rota:chamador`, nunca o IP cru. So a service_role
   le e escreve.';

-- RLS ligado, e a policy que existe NEGA. Sem policy nenhuma o efeito seria o
-- mesmo, mas `rls_ligado_em_todo_o_schema_test.sql` trata tabela sem policy
-- como provavel esquecimento e pede que a decisao seja tomada -- esta e ela,
-- escrita no catalogo em vez de virar excecao no teste. Segundo portao atras
-- dos revokes abaixo; a service_role ignora RLS e nao e afetada.
alter table public.limites_de_taxa enable row level security;

drop policy if exists "Nenhum acesso pela API" on public.limites_de_taxa;
create policy "Nenhum acesso pela API" on public.limites_de_taxa
  for all to anon, authenticated
  using (false)
  with check (false);

-- O default privilege da 0038 da SELECT a anon e authenticated em toda tabela
-- nova de `public`. Aqui nao deve dar: revogado explicitamente.
revoke all on table public.limites_de_taxa from anon, authenticated;
grant select, insert, update, delete on table public.limites_de_taxa to service_role;

-- Varredura da limpeza (passo 2 da funcao): sem indice, o `delete` por
-- `expira_em` leria a tabela inteira.
create index if not exists limites_de_taxa_expira_em_idx
  on public.limites_de_taxa (expira_em);

-- ---------------------------------------------------------------------------
-- Consumo atomico
--
-- Devolve 0 quando a requisicao cabe no limite, e os segundos ate a janela
-- reabrir quando nao cabe -- o valor do `Retry-After`.
--
-- UM STATEMENT SO. `insert ... on conflict do update` trava a linha do balde, e
-- duas instancias chamando ao mesmo tempo serializam nela: nao ha janela entre
-- ler a contagem e grava-la em que as duas vejam "ainda cabe". Um `select`
-- seguido de `update` teria exatamente essa janela, que e o defeito do `Map`
-- por processo reaparecendo dentro do banco.
--
-- `security invoker`: quem chama e a service_role, que ja tem o grant da
-- tabela. Nao ha privilegio a emprestar.
-- ---------------------------------------------------------------------------

create or replace function public.consumir_limite_de_taxa(
  p_chave text,
  p_limite integer,
  p_janela_ms integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_contagem integer;
  v_expira_em timestamptz;
begin
  if p_limite is null or p_limite < 1 or p_janela_ms is null or p_janela_ms < 1 then
    raise exception 'limite e janela precisam ser positivos (limite=%, janela_ms=%)', p_limite, p_janela_ms
      using errcode = '22023';
  end if;

  -- 1) Consome. Janela vencida recomeca do 1; janela aberta soma.
  --
  -- `clock_timestamp()` e nao `now()`: `now()` e o inicio da TRANSACAO, e uma
  -- chamada dentro de uma transacao longa enxergaria o relogio parado.
  insert into public.limites_de_taxa as l (chave, contagem, expira_em)
  values (p_chave, 1, clock_timestamp() + make_interval(secs => p_janela_ms / 1000.0))
  on conflict (chave) do update
    set contagem = case when l.expira_em <= clock_timestamp() then 1 else l.contagem + 1 end,
        expira_em = case when l.expira_em <= clock_timestamp() then excluded.expira_em else l.expira_em end
  returning contagem, expira_em into v_contagem, v_expira_em;

  -- 2) Limpeza por amostragem. Uma chave por IP distinto que ja passou pela
  -- rota ficaria na tabela para sempre. Em vez de um job agendado a mais, uma
  -- em cada cem chamadas apaga o que venceu ha mais de uma hora -- a folga de
  -- uma hora fica muito acima da janela de qualquer rota atual (a maior e de
  -- um minuto), entao nunca apaga um balde ainda em uso.
  if random() < 0.01 then
    delete from public.limites_de_taxa
     where expira_em < clock_timestamp() - interval '1 hour';
  end if;

  if v_contagem > p_limite then
    return greatest(1, ceil(extract(epoch from (v_expira_em - clock_timestamp())))::integer);
  end if;

  return 0;
end;
$$;

comment on function public.consumir_limite_de_taxa(text, integer, integer) is
  'Consome uma requisicao do balde (0048). 0 = permitido; N > 0 = recusado,
   janela reabre em N segundos. Chamavel so pela service_role.';

revoke all on function public.consumir_limite_de_taxa(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite_de_taxa(text, integer, integer) to service_role;
