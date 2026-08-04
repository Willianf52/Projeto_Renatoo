-- ============================================================================
-- Restringe o que o usuario altera no proprio perfil
--
-- A migration 0003 concedeu update em (nome_completo, funcao, login) para
-- `authenticated`. `funcao` e `login` sao dados administrativos:
--
--   - `login` identifica a pessoa na listagem que a gestao enxerga. Deixar o
--     proprio usuario reescreve-lo permite se passar por outro na tela e
--     embaralhar qualquer conferencia feita por ali.
--   - `funcao` descreve o cargo exercido (Ronda, Lider de limpeza). Quem
--     define isso e a gestao, nao a pessoa.
--
-- Volta ao criterio da migration 0002: o usuario edita apenas o proprio nome.
-- `cargo` e `ativo` seguem fora de qualquer grant -- e o que impede
-- auto-promocao de nivel de acesso e auto-reativacao de conta desativada.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

revoke update on public.profiles from authenticated;

grant update (nome_completo) on public.profiles to authenticated;

comment on column public.profiles.login is
  'Identificador administrativo. Alterado apenas por painel, SQL ou service_role.';
comment on column public.profiles.funcao is
  'Cargo descritivo definido pela gestao. Ex: Ronda, Lider de limpeza.
   Alterado apenas por painel, SQL ou service_role.';
