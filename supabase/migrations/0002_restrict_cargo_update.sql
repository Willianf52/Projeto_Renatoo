-- ============================================================================
-- VeloxLab — Restringe alteracao de cargo
--
-- A politica de RLS "Usuario atualiza apenas o proprio perfil" permite que o
-- usuario altere qualquer coluna da propria linha, incluindo `cargo`. Na
-- pratica isso permitiria a um Operador se promover a Administrador via API.
--
-- RLS nao expressa permissao por coluna, entao a restricao vem de GRANTs em
-- nivel de coluna. Como um GRANT de tabela inteira cobre todas as colunas e
-- nao pode ser desfeito coluna a coluna, o privilegio de tabela e revogado
-- primeiro e so entao a unica coluna editavel e concedida de volta.
--
-- Alteracoes de cargo passam a ocorrer apenas via painel, SQL ou service_role.
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Remove o UPDATE de tabela inteira (cobria todas as colunas) -------------

revoke update on public.profiles from authenticated;

-- 2) Devolve o UPDATE apenas na coluna que o usuario pode editar ------------

grant update (nome_completo) on public.profiles to authenticated;

-- A politica de RLS continua valendo por cima: mesmo em nome_completo, o
-- usuario so alcanca a propria linha (auth.uid() = id).
