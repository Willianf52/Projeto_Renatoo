-- ============================================================================
-- VeloxLab — Revoga EXECUTE de PUBLIC em handle_new_user()
--
-- A migration 0027 revogou EXECUTE de `anon` e `authenticated` em
-- `handle_new_user()`, mas o advisor continuou acusando a função como
-- executável por ambos os papeis. Causa: diferente das outras funcoes
-- SECURITY DEFINER deste arquivo (criadas ja com `revoke all ... from
-- public`), `handle_new_user()` (migration 0008) manteve o grant implicito
-- de EXECUTE que o Postgres concede a PUBLIC na criacao de qualquer funcao.
-- `anon` e `authenticated` sao membros de PUBLIC, entao revogar dos dois
-- papeis nominalmente nao tira o acesso herdado de PUBLIC.
--
-- Confirmado direto nos grants (proacl) que o problema era esse: a funcao
-- tinha `=X/postgres` (o `=` vazio antes do `X` marca PUBLIC) na acl, algo
-- que nenhuma das outras oito funcoes revogadas pela 0027 tinha.
-- ============================================================================

revoke execute on function public.handle_new_user() from public;
