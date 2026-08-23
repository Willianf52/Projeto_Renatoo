-- ============================================================================
-- VeloxLab — Tabela de auditoria
--
-- Nenhuma tabela deste projeto guarda quem mudou o quê. `profiles` nem tem
-- `updated_at` (migration 0001). Quem desativou um usuário, quem alterou um
-- `cargo` -- e `cargo` é o que concede nível de acesso, por isso as migrations
-- 0002/0007 negam esse UPDATE a `authenticated` -- não é recuperável nem no
-- dia seguinte. Ver o item "Nenhuma alteração de cadastro é rastreável a uma
-- pessoa" em docs/melhorias.md.
--
-- Uma linha por INSERT/UPDATE/DELETE nas cinco tabelas sensíveis: `profiles`,
-- `sites`, `grupos_sites`, `grupos_usuarios`, `qr_codes`.
--
-- QUEM GRAVA CADA TABELA NÃO É UNIFORME, E ISSO MUDA COMO CADA UMA É COBERTA
--
-- `sites`, `grupos_sites` e `grupos_usuarios` escrevem com o token da sessão
-- (RLS ativo, migrations 0009/0012/0016) e `qr_codes` idem (0015) -- nessas
-- quatro, `auth.uid()` dentro do trigger reflete corretamente quem fez a
-- chamada, porque o PostgREST propaga o JWT de quem chamou. `registrar_auditoria()`
-- abaixo cobre as quatro genericamente.
--
-- `profiles` é a exceção, e de propósito NÃO ganha o mesmo trigger aqui.
-- `usuarios/actions.ts` escreve com `service_role` (`cargo`/`ativo`/`tipo` não
-- têm grant de UPDATE para `authenticated`, ver 0002/0007/0019) -- e uma
-- conexão de `service_role` não carrega JWT de pessoa nenhuma: `auth.uid()`
-- dentro do trigger seria sempre `null`. Um trigger que só produzisse linhas
-- com `ator_id: null` seria pior que a ausência dele -- daria a impressão de
-- rastreamento funcionando sem rastrear a única coisa que este item pediu
-- ("quem alterou um cargo"). Em vez disso, `usuarios/actions.ts` grava em
-- `auditoria` explicitamente, no mesmo código que já sabe quem está editando
-- (a checagem de `pode_administrar_usuarios()` roda com o cliente da sessão,
-- antes de qualquer escrita).
--
-- RLS: leitura para quem `pode_administrar_usuarios()` (migration 0013) -- a
-- régua mais estreita já existente, e a mesma que decide quem pode alterar
-- `cargo` em primeiro lugar. Sem policy de escrita: só o trigger (via
-- `security definer`) e a rota de usuários (via `service_role`) gravam.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,

  -- Nome da tabela afetada (`sites`, `profiles`, ...), preenchido por
  -- `tg_table_name` nas quatro tabelas com trigger, ou literal na gravação
  -- explícita de `profiles`.
  tabela text not null,
  -- Chave primária do registro afetado. `text`, não `bigint`/`uuid`: precisa
  -- caber tanto o `id` numérico das quatro tabelas quanto o uuid de `profiles`.
  registro_id text not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  -- Quem fez a mudança. Nulo é um valor real e esperado só nas linhas geradas
  -- por um processo sem sessão de pessoa nenhuma -- nenhuma das cinco tabelas
  -- cobertas hoje deveria produzir isso; ver o cabeçalho.
  ator_id uuid references public.profiles (id) on delete set null,

  -- A linha inteira antes/depois, como veio de `to_jsonb(old)`/`to_jsonb(new)`.
  -- Nulo em INSERT (não há "antes") e em DELETE (não há "depois").
  dados_antigos jsonb,
  dados_novos jsonb,

  criado_em timestamptz not null default now()
);

comment on table public.auditoria is
  'Uma linha por INSERT/UPDATE/DELETE em profiles/sites/grupos_sites/grupos_usuarios/qr_codes.';

create index if not exists auditoria_criado_em_idx on public.auditoria (criado_em desc);
create index if not exists auditoria_tabela_registro_idx on public.auditoria (tabela, registro_id);
create index if not exists auditoria_ator_id_idx on public.auditoria (ator_id) where ator_id is not null;

alter table public.auditoria enable row level security;

drop policy if exists "Leitura para quem administra usuarios" on public.auditoria;
create policy "Leitura para quem administra usuarios" on public.auditoria
  for select to authenticated using (public.pode_administrar_usuarios());

-- Defesa em profundidade, redundante com a 0031 (que já fecha o default
-- privilege para tabelas novas) -- ver o comentário da própria 0031 sobre por
-- que o revoke explícito continua valendo a pena documentado aqui.
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

-- 2) Função de trigger, reaproveitada pelas quatro tabelas ------------------

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro_id text;
begin
  v_registro_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');

  insert into public.auditoria (tabela, registro_id, operacao, ator_id, dados_antigos, dados_novos)
  values (
    tg_table_name,
    v_registro_id,
    tg_op,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.registrar_auditoria() is
  'Trigger AFTER INSERT/UPDATE/DELETE que grava a linha inteira (antes/depois) em auditoria, com auth.uid() como ator.';

-- Só disparado por trigger, nunca chamado direto -- mesmo cuidado das 0026/
-- 0027/0028 com funcao SECURITY DEFINER: sem isto, PUBLIC (que inclui `anon`
-- e `authenticated`) ganharia EXECUTE por padrao e poderia chamar via
-- /rest/v1/rpc/registrar_auditoria. Chamada fora de um trigger falha (NEW/OLD/
-- TG_OP nao existem), mas o grant nem deveria existir para alguem tentar.
revoke all on function public.registrar_auditoria() from public;

-- 3) Triggers nas quatro tabelas que escrevem com o token da sessao ---------

drop trigger if exists auditoria_trigger on public.sites;
create trigger auditoria_trigger
  after insert or update or delete on public.sites
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.grupos_sites;
create trigger auditoria_trigger
  after insert or update or delete on public.grupos_sites
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.grupos_usuarios;
create trigger auditoria_trigger
  after insert or update or delete on public.grupos_usuarios
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.qr_codes;
create trigger auditoria_trigger
  after insert or update or delete on public.qr_codes
  for each row execute function public.registrar_auditoria();
