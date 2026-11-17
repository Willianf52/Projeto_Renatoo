-- ============================================================================
-- 0103: notificacoes no portal e no app
--
-- O pedido do gestor (16/11/2026, autorizado em 17/11) traz avisos que nao
-- sao e-mail: a revisao do veiculo aos 9.000 km e a meta de visitas abaixo na
-- sexta de manha. O dono escolheu que cheguem "do app e do portal". Esta
-- migration e so a base: a caixa de avisos de cada pessoa. Quem gera os avisos
-- (veiculos, metas) vem nas migrations seguintes, sempre por
-- `manutencao.notificar`.
--
-- Regras:
--   * Cada pessoa le e marca como lidas SO as proprias notificacoes (RLS).
--   * Ninguem cria notificacao pela API: so funcoes do banco (security
--     definer em `manutencao`, schema que o PostgREST nao expoe).
--   * A unica coluna que `authenticated` escreve e `lida_em` (grant por
--     coluna); titulo, texto e destinatario nao mudam depois de criados.
--   * `chave` evita aviso repetido: o mesmo aviso para a mesma pessoa entra
--     uma vez so (ex.: 'revisao:veiculo:12:30000').
--   * Expurgo diario: lidas ha mais de 90 dias e qualquer uma com mais de 180.
--
-- Notificacao no celular (push) fica para quando o app ganhar o modulo nativo
-- de notificacoes: precisa de APK novo e de credencial do Firebase.
-- ============================================================================

create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  destinatario_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null check (tipo ~ '^[A-Z_]{3,40}$'),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto text not null default '' check (char_length(texto) <= 1000),
  -- Caminho dentro do portal (comeca com "/"), nunca endereco de fora.
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  chave text check (chave is null or char_length(chave) <= 200),
  criada_em timestamptz not null default now(),
  lida_em timestamptz,
  constraint notificacoes_chave_unica unique (destinatario_id, chave)
);

comment on table public.notificacoes is
  'Avisos para uma pessoa (portal e app). Criados so por funcoes do banco (manutencao.notificar); a pessoa le e marca como lidas as proprias. 0103.';

create index if not exists notificacoes_destinatario_idx
  on public.notificacoes (destinatario_id, criada_em desc);
create index if not exists notificacoes_nao_lidas_idx
  on public.notificacoes (destinatario_id) where lida_em is null;

alter table public.notificacoes enable row level security;

revoke all on public.notificacoes from anon, authenticated;
grant select on public.notificacoes to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;

drop policy if exists notificacoes_ler_as_proprias on public.notificacoes;
create policy notificacoes_ler_as_proprias on public.notificacoes
  for select to authenticated
  using (destinatario_id = (select auth.uid()));

drop policy if exists notificacoes_marcar_as_proprias on public.notificacoes;
create policy notificacoes_marcar_as_proprias on public.notificacoes
  for update to authenticated
  using (destinatario_id = (select auth.uid()))
  with check (destinatario_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Quem cria: so funcoes do banco
-- ---------------------------------------------------------------------------
create or replace function manutencao.notificar(
  p_destinatarios uuid[],
  p_tipo text,
  p_titulo text,
  p_texto text default '',
  p_link text default null,
  p_chave text default null
)
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_criadas integer;
begin
  insert into public.notificacoes (destinatario_id, tipo, titulo, texto, link, chave)
  select distinct p.id, p_tipo, p_titulo, coalesce(p_texto, ''), p_link, p_chave
    from public.profiles p
   where p.id = any (p_destinatarios)
     and p.ativo
  on conflict (destinatario_id, chave) do nothing;

  get diagnostics v_criadas = row_count;
  return v_criadas;
end;
$$;

comment on function manutencao.notificar(uuid[], text, text, text, text, text) is
  'Cria uma notificacao para cada pessoa ATIVA da lista; com chave, nao repete o mesmo aviso para a mesma pessoa. Devolve quantas criou. 0103.';

revoke all on function manutencao.notificar(uuid[], text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expurgo diario
-- ---------------------------------------------------------------------------
create or replace function manutencao.expurgar_notificacoes()
returns integer
language sql
security definer
set search_path = manutencao, public, pg_temp
as $$
  with apagadas as (
    delete from public.notificacoes
     where (lida_em is not null and lida_em < now() - interval '90 days')
        or criada_em < now() - interval '180 days'
    returning 1
  )
  select count(*)::integer from apagadas;
$$;

revoke all on function manutencao.expurgar_notificacoes() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'expurgar-notificacoes';
    perform cron.schedule(
      'expurgar-notificacoes',
      '40 6 * * *',
      $cron$select manutencao.expurgar_notificacoes()$cron$
    );
  end if;
end;
$$;
