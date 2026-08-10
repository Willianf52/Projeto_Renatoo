-- ============================================================================
-- VeloxLab — Hierarquia entre grupos de sites
--
-- O formulario de referencia de "Grupo de Sites" tem um campo "Grupo de Site
-- Pai" -- uma arvore entre grupos, igual a que `site_superior_id` (migration
-- 0021) ja da aos sites. `grupos_sites` nao tinha essa coluna.
--
-- Mesmo padrao da 0021: auto-referencia, `on delete set null` (apagar o pai
-- nao pode apagar o filho junto), e uma constraint que barra so o ciclo direto
-- -- um grupo apontar para si mesmo. Ciclos mais longos (A > B > A) exigiriam
-- trigger recursivo; o caso comum e um clique errado no select, e esse fica
-- barrado no banco.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

alter table public.grupos_sites
  add column if not exists grupo_pai_id bigint references public.grupos_sites (id) on delete set null;

comment on column public.grupos_sites.grupo_pai_id is
  'Grupo de sites pai na arvore de grupos. Nulo = raiz, que e o caso comum.';

alter table public.grupos_sites drop constraint if exists grupos_sites_pai_nao_e_si_mesmo;
alter table public.grupos_sites
  add constraint grupos_sites_pai_nao_e_si_mesmo check (grupo_pai_id is distinct from id);

-- Mesma justificativa de `sites_superior_idx` na 0021: sem indice, achar os
-- filhos de um grupo percorreria a tabela inteira.
create index if not exists grupos_sites_pai_idx on public.grupos_sites (grupo_pai_id);

-- ---------------------------------------------------------------------------
-- Permissoes de coluna
--
-- Os grants da 0009 listam coluna por coluna, entao a coluna nova nasce sem
-- permissao de escrita -- refeitos aqui com a lista completa, mesmo criterio
-- daquela migration (e da 0021, que fez o mesmo para `sites`).
-- ---------------------------------------------------------------------------
revoke insert, update on public.grupos_sites from authenticated;
grant insert (nome, descricao, ativo, grupo_pai_id) on public.grupos_sites to authenticated;
grant update (nome, descricao, ativo, grupo_pai_id) on public.grupos_sites to authenticated;
