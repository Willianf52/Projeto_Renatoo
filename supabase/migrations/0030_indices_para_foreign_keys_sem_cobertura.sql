-- ============================================================================
-- VeloxLab — Índices para foreign keys sem cobertura
--
-- Achado pelo advisor de performance do Supabase (`unindexed_foreign_keys`,
-- 2026-08-16): dez foreign keys sem índice cobrindo a coluna. Sem índice, um
-- DELETE/UPDATE na tabela pai (ex.: apagar um `evento`) faz o Postgres varrer
-- a tabela filha inteira para checar a integridade referencial, e joins pela
-- FK (ex.: leitura -> ação/área/qualificador) não têm por onde entrar.
--
-- `create index if not exists`, mesmo padrão de nomenclatura das migrations
-- 0011/0018 (`<tabela>_<coluna>_idx`).
-- ============================================================================

create index if not exists leituras_acao_id_idx on public.leituras (acao_id);
create index if not exists leituras_area_id_idx on public.leituras (area_id);
create index if not exists leituras_qr_code_id_idx on public.leituras (qr_code_id);
create index if not exists leituras_qualificador_id_idx on public.leituras (qualificador_id);

create index if not exists profiles_superior_id_idx on public.profiles (superior_id);

create index if not exists sites_criado_por_idx on public.sites (criado_por);
create index if not exists sites_responsavel_id_idx on public.sites (responsavel_id);
create index if not exists sites_tipo_servico_id_idx on public.sites (tipo_servico_id);

create index if not exists visitas_coletor_dados_id_idx on public.visitas (coletor_dados_id);
create index if not exists visitas_motivo_visita_id_idx on public.visitas (motivo_visita_id);
