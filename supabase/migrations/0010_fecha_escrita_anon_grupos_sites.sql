-- ============================================================================
-- VeloxLab — Fecha escrita anon em grupos de sites
--
-- A migration 0009 estreitou INSERT e UPDATE para authenticated, mas os
-- grants padrão que o Supabase deixa para anon continuaram intactos. O RLS
-- barra anon hoje porque as policies são `to authenticated`; mesmo assim,
-- manter privilégios de escrita no papel anônimo cria uma armadilha: uma
-- policy futura sem `to authenticated` usa `public` por padrão e liberaria
-- escrita por acidente.
--
-- Não há motivo legítimo para anon escrever nesta tabela. A aplicação exige
-- sessão autenticada e o RLS é uma segunda camada, não a única.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

revoke insert, update on public.grupos_sites from anon;
