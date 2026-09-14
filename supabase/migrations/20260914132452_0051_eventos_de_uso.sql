-- ============================================================================
-- VeloxLab — eventos de uso do painel (P2-4)
--
-- Auditoria de 11/09, P2-4: "depois do go-live, ninguem sabera o que e usado".
-- O Sentry ve erro e latencia, nao uso -- seis relatorios construidos e
-- nenhuma forma de saber qual deles alguem abre.
--
-- DECISAO (14/09): tabela propria, e nao Vercel Analytics. O dado nao sai do
-- Supabase, fica sob RLS e cabe no `docs/lgpd-privacidade.md` que ja existe.
--
-- O QUE ENTRA, E O QUE FICA DE FORA DE PROPOSITO:
--
--   - `login`: quem entrou, com qual cargo. O `auth.audit_log_entries` do
--     GoTrue registra o login, mas nao o cargo, e nao e consultavel por
--     `authenticated`.
--   - `tela_aberta`: rota do painel e os NOMES dos filtros preenchidos
--     (`["data_inicial", "site"]`), nunca os valores. "Com qual filtro" e a
--     pergunta de produto; o valor (qual site, qual funcionario) seria dado
--     de operacao repetido numa tabela sem necessidade.
--
--   - Checklist enviado e importacao disparada NAO entram: ja sao linhas em
--     `checklists` e `importacoes`, com data e autor. Um evento aqui seria a
--     segunda fonte do mesmo numero -- e as duas divergiriam no primeiro
--     retry do app de campo.
--
-- QUEM E O AUTOR NAO VEM DO CLIENTE. `perfil_id` e `cargo` sao preenchidos
-- pelo trigger a partir de `auth.uid()` e de `profiles`. O grant de INSERT e
-- so nas colunas `evento` e `detalhes`: um cliente nao consegue gravar evento
-- em nome de outra pessoa nem se declarar GESTOR.
--
-- LEITURA: so quem ve a operacao inteira (`pode_ver_toda_operacao`). Nao ha
-- tela -- a consulta e por SQL, como decidido para features de governanca.
--
-- RETENCAO: sem expurgo nesta migration. O prazo entra na secao de retencao
-- do `docs/lgpd-privacidade.md`, junto de `leituras`/`visitas`, que ainda
-- esperam a mesma decisao de produto.
-- ============================================================================

create table public.eventos_de_uso (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  perfil_id uuid references public.profiles (id) on delete set null,
  cargo text,
  evento text not null check (evento in ('login', 'tela_aberta')),
  -- Teto de tamanho: e telemetria, nao armazenamento. Um cliente com bug
  -- mandando um objeto gigante nao deve conseguir encher a tabela.
  detalhes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detalhes) = 'object' and octet_length(detalhes::text) <= 2000)
);

comment on table public.eventos_de_uso is
  'Telemetria de uso do painel (P2-4). Sem valores de filtro nem dado de operacao -- ver migration 0051.';

create index eventos_de_uso_evento_criado_em_idx on public.eventos_de_uso (evento, criado_em desc);
create index eventos_de_uso_perfil_id_idx on public.eventos_de_uso (perfil_id);

alter table public.eventos_de_uso enable row level security;

-- ---------------------------------------------------------------------------
-- Autor preenchido pelo banco
--
-- `security invoker`: le a propria linha de `profiles`, que a policy da 0006
-- ja libera para qualquer usuario ativo. Sobrescreve o que vier do cliente
-- mesmo que um grant futuro abra as colunas.
-- ---------------------------------------------------------------------------
create function public.preencher_autor_do_evento()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.perfil_id := auth.uid();
  new.cargo := (select p.cargo from public.profiles p where p.id = auth.uid());
  new.criado_em := now();
  return new;
end;
$$;

revoke all on function public.preencher_autor_do_evento() from public, anon, authenticated;

create trigger preencher_autor_do_evento
  before insert on public.eventos_de_uso
  for each row execute function public.preencher_autor_do_evento();

-- ---------------------------------------------------------------------------
-- Grants e policies
-- ---------------------------------------------------------------------------
revoke all on public.eventos_de_uso from anon, authenticated;

grant insert (evento, detalhes) on public.eventos_de_uso to authenticated;
grant select on public.eventos_de_uso to authenticated;
grant all on public.eventos_de_uso to service_role;

create policy "usuario ativo registra o proprio evento"
  on public.eventos_de_uso
  for insert
  to authenticated
  with check (autorizacao.usuario_ativo());

create policy "gestao le os eventos de uso"
  on public.eventos_de_uso
  for select
  to authenticated
  using ((select autorizacao.pode_ver_toda_operacao()));
