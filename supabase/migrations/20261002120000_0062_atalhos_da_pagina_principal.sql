-- ============================================================================
-- 0062 -- Pagina Principal: atalhos fixados e uso das telas
--
-- PEDIDO DO DONO (02/10/2026): trazer a "Pagina Principal" do sistema de
-- referencia -- uma grade de 12 atalhos para as telas do menu. Quem usa pode
-- FIXAR um atalho numa posicao; os nao fixados sao reordenados pelo uso do
-- mes anterior, de cada pessoa.
--
-- Duas coisas faltavam no banco:
--
-- 1) ONDE GUARDAR OS FIXADOS. `atalhos_fixados`: uma linha por atalho fixado,
--    da propria pessoa. No maximo 12 (posicao 0..11, unica por pessoa), que e
--    o tamanho da grade. A lista de telas NAO mora aqui -- e o menu do painel
--    (`apps/web/src/components/dashboard/telas-do-menu.ts`); o banco so guarda a rota.
--
-- 2) LER O PROPRIO USO. `eventos_de_uso` (0051) ja registra cada tela aberta,
--    mas so a gestao le a tabela. A policy nova deixa cada pessoa ler as
--    PROPRIAS linhas -- e dado dela mesma, e nada alem de rota e horario --,
--    e `uso_das_minhas_telas` devolve so a contagem por rota, filtrada pelo
--    `auth.uid()` mesmo para quem e gestao e enxerga todo mundo.
--
-- `salvar_atalhos_fixados` troca o conjunto inteiro numa transacao: apagar e
-- regravar pela API em duas chamadas deixaria, numa falha no meio, a pessoa
-- sem nenhum atalho fixado. As duas funcoes sao `security invoker`: quem
-- decide o que pode e o RLS da tabela, como em todo o resto do schema.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Atalhos fixados ------------------------------------------------------------

create table if not exists public.atalhos_fixados (
  perfil_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rota text not null,
  posicao smallint not null,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, rota),
  constraint atalhos_fixados_posicao_unica unique (perfil_id, posicao),
  constraint atalhos_fixados_posicao_na_grade check (posicao between 0 and 11),
  -- So rota interna do painel: o valor vira `href` na tela.
  constraint atalhos_fixados_rota_do_painel
    check (rota ~ '^/dashboard(/[a-z0-9-]+)*$' and length(rota) <= 200)
);

comment on table public.atalhos_fixados is
  'Atalhos que cada pessoa fixou na Pagina Principal do painel (no maximo 12,
   um por posicao da grade). Migration 0062.';

alter table public.atalhos_fixados enable row level security;

revoke all on public.atalhos_fixados from anon, authenticated;
grant select, delete on public.atalhos_fixados to authenticated;
-- `perfil_id` fora do grant: vem do default `auth.uid()`.
grant insert (rota, posicao) on public.atalhos_fixados to authenticated;
grant all on public.atalhos_fixados to service_role;

drop policy if exists "pessoa le os proprios atalhos" on public.atalhos_fixados;
create policy "pessoa le os proprios atalhos"
  on public.atalhos_fixados
  for select
  to authenticated
  using (perfil_id = (select auth.uid()));

drop policy if exists "pessoa ativa fixa os proprios atalhos" on public.atalhos_fixados;
create policy "pessoa ativa fixa os proprios atalhos"
  on public.atalhos_fixados
  for insert
  to authenticated
  with check (perfil_id = (select auth.uid()) and (select autorizacao.usuario_ativo()));

drop policy if exists "pessoa ativa desfixa os proprios atalhos" on public.atalhos_fixados;
create policy "pessoa ativa desfixa os proprios atalhos"
  on public.atalhos_fixados
  for delete
  to authenticated
  using (perfil_id = (select auth.uid()) and (select autorizacao.usuario_ativo()));

-- 2) Cada pessoa le o proprio uso ------------------------------------------------

drop policy if exists "pessoa le o proprio uso" on public.eventos_de_uso;
create policy "pessoa le o proprio uso"
  on public.eventos_de_uso
  for select
  to authenticated
  using (perfil_id = (select auth.uid()));

create or replace function public.uso_das_minhas_telas(p_desde timestamptz, p_ate timestamptz)
returns table (rota text, vezes bigint)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select e.detalhes->>'rota' as rota, count(*) as vezes
    from public.eventos_de_uso e
   where e.perfil_id = auth.uid()
     and e.evento = 'tela_aberta'
     and e.criado_em >= p_desde
     and e.criado_em < p_ate
     and e.detalhes ? 'rota'
   group by 1;
$$;

revoke all on function public.uso_das_minhas_telas(timestamptz, timestamptz) from public, anon;
grant execute on function public.uso_das_minhas_telas(timestamptz, timestamptz) to authenticated;

-- 3) Trocar os fixados de uma vez -----------------------------------------------
-- `p_atalhos`: [{"rota": "/dashboard/...", "posicao": 0}, ...]. Lista vazia e
-- o "Restaurar padrao". Rota repetida, posicao fora da grade ou mais de 12
-- caem nas constraints da tabela, e a transacao inteira volta.

create or replace function public.salvar_atalhos_fixados(p_atalhos jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_atalhos) is distinct from 'array' then
    raise exception 'p_atalhos precisa ser uma lista' using errcode = '22023';
  end if;

  delete from public.atalhos_fixados where perfil_id = auth.uid();

  insert into public.atalhos_fixados (rota, posicao)
  select a->>'rota', (a->>'posicao')::smallint
    from jsonb_array_elements(p_atalhos) as a;
end;
$$;

revoke all on function public.salvar_atalhos_fixados(jsonb) from public, anon;
grant execute on function public.salvar_atalhos_fixados(jsonb) to authenticated;
