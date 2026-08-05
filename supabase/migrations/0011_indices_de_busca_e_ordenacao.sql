-- ============================================================================
-- VeloxLab — Índices de busca e ordenação
--
-- Três lacunas de índice, todas em colunas já usadas pelas telas de cadastro
-- e sem cobertura hoje:
--
-- 1) `ilike '%termo%'` em grupos_sites.nome/descricao e em
--    profiles.nome_completo/email (via `lib/postgrest-escape.ts`) não usa
--    índice btree comum -- um padrão com "%" nas duas pontas força
--    sequential scan mesmo com índice na coluna. `pg_trgm` com GIN resolve:
--    indexa trigramas do texto, e o padrão casa contra eles independente de
--    onde o "%" aparece.
-- 2) `leituras` é ordenada por (data_hora desc, id desc)
--    (coletas-importadas/queries.ts), mas o índice da migration 0004 é só
--    (data_hora desc) -- não cobre o desempate por id, e leituras é a tabela
--    que mais cresce aqui.
-- 3) `profiles` é ordenada por nome_completo (usuarios/queries.ts) sem
--    índice nessa coluna.
--
-- Não testado contra um banco local: `supabase/` não tem `config.toml`, então
-- não há como rodar `supabase db reset` neste ambiente (mesma lacuna que o
-- MELHORIAS.md registra para os testes de RLS). Revisar o plano de execução
-- (`explain analyze`) antes de aplicar em produção.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create extension if not exists pg_trgm;

-- 1) Busca livre com ilike ----------------------------------------------------

create index if not exists grupos_sites_nome_trgm_idx
  on public.grupos_sites using gin (nome gin_trgm_ops);
create index if not exists grupos_sites_descricao_trgm_idx
  on public.grupos_sites using gin (descricao gin_trgm_ops);

create index if not exists profiles_nome_completo_trgm_idx
  on public.profiles using gin (nome_completo gin_trgm_ops);
create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email gin_trgm_ops);

-- 2) Ordenação de leituras -----------------------------------------------------
-- Substitui o índice de coluna única da migration 0004: um índice composto
-- também serve consultas que ordenam só por data_hora (a coluna líder), então
-- manter os dois seria overhead de escrita sem ganho de leitura.

drop index if exists public.leituras_data_hora_idx;
create index if not exists leituras_data_hora_id_idx
  on public.leituras (data_hora desc, id desc);

-- 3) Ordenação de profiles -----------------------------------------------------

create index if not exists profiles_nome_completo_idx
  on public.profiles (nome_completo);
