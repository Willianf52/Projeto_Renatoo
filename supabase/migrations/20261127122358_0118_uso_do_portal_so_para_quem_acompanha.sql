-- ============================================================================
-- 0118: o uso do portal e so de quem acompanha (o dono), nao da gestao toda
--
-- Pedido do dono (27/11/2026): a tela "Uso do Portal" (0117) visivel so para a
-- conta dele. Esconder no menu nao basta: desde a 0051 qualquer GESTOR ou
-- SUPERVISOR le `eventos_de_uso` direto pela API ("gestao le os eventos de
-- uso"). Aqui a leitura de todo mundo passa a ser de uma lista explicita.
--
--   * `manutencao.quem_acompanha_o_uso`: a lista (perfis). Fica no schema
--     `manutencao`, que o PostgREST nao expoe, e NAO e preenchida por
--     migration: o repositorio e publico, e quem entra na lista e decisao de
--     operacao, feita por SQL no painel (como `aviso_de_inspecao`, 0080).
--   * `autorizacao.pode_ver_uso_do_portal()`: ativo E na lista.
--   * `public.pode_ver_uso_do_portal()`: a mesma resposta para o portal (RPC),
--     que decide menu, atalhos e o portao da tela.
--   * A policy da gestao em `eventos_de_uso` vira "quem acompanha o uso le
--     tudo". "Pessoa le o proprio uso" (0062) continua: os atalhos da Pagina
--     Principal de cada um dependem dela.
--
-- As funcoes da 0117 sao SECURITY INVOKER, entao passam a mostrar tudo so a
-- quem esta na lista; qualquer outro ve so o proprio uso, como antes.
-- O expurgo de 12 meses (0052) roda pelo pg_cron, fora do RLS, e nao muda.
-- ============================================================================

create table if not exists manutencao.quem_acompanha_o_uso (
  perfil_id uuid primary key references public.profiles (id) on delete cascade,
  incluido_em timestamptz not null default now()
);

comment on table manutencao.quem_acompanha_o_uso is
  'Quem ve o uso do portal de todo mundo (0118). Preenchida por SQL no painel, nunca por migration (repo publico).';

revoke all on manutencao.quem_acompanha_o_uso from public, anon, authenticated;

create or replace function autorizacao.pode_ver_uso_do_portal()
returns boolean
language sql
stable
security definer
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.usuario_ativo()
    and exists (
      select 1 from manutencao.quem_acompanha_o_uso q where q.perfil_id = auth.uid()
    );
$$;

revoke all on function autorizacao.pode_ver_uso_do_portal() from public, anon;
grant execute on function autorizacao.pode_ver_uso_do_portal() to authenticated;

create or replace function public.pode_ver_uso_do_portal()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select autorizacao.pode_ver_uso_do_portal() $$;

revoke all on function public.pode_ver_uso_do_portal() from public, anon;
grant execute on function public.pode_ver_uso_do_portal() to authenticated;

drop policy if exists "gestao le os eventos de uso" on public.eventos_de_uso;
drop policy if exists "quem acompanha o uso le tudo" on public.eventos_de_uso;
create policy "quem acompanha o uso le tudo"
  on public.eventos_de_uso
  for select
  to authenticated
  using ((select autorizacao.pode_ver_uso_do_portal()));
