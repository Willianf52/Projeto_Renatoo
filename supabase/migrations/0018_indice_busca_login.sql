-- ============================================================================
-- VeloxLab — Índice da busca por login
--
-- A tela de Usuários trocou os filtros separados de Nome e E-mail por uma
-- busca livre única, que passou a alcançar também `login`. `nome_completo` e
-- `email` já tinham índice trigram desde a 0011; `login` não, porque até então
-- nada o pesquisava.
--
-- Sem ele o ramo do `or(...)` que casa `login` faz sequential scan enquanto os
-- outros dois usam índice -- e basta um ramo sem índice para a consulta varrer
-- `profiles` inteira. Mesmo raciocínio da 0011: `ilike '%termo%'` não usa
-- btree comum, um padrão com "%" nas duas pontas força a varredura mesmo com
-- índice na coluna.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create index if not exists profiles_login_trgm_idx
  on public.profiles using gin (login gin_trgm_ops);
