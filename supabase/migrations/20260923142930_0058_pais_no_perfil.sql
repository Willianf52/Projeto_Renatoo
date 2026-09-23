-- ============================================================================
-- 0058 — `pais` no perfil
--
-- POR QUE. A listagem de Usuarios do sistema de referencia tem uma coluna
-- "Pais", e a busca livre de la diz procurar por "Nome, Email, Login, Pais".
-- `sites` ja tem a coluna desde a 0021; `profiles` nao tinha.
--
-- Hoje o valor e constante: todas as linhas da referencia mostram "Brasil". A
-- coluna nasce com esse default, entao nenhum cadastro existente precisa ser
-- tocado e nenhuma tela quebra por linha sem valor.
--
-- GRANTS EXPLICITOS, E NAO HERDADOS. Desde a 0038/0039 este schema nao tem
-- grant de tabela inteira: cada coluna de `profiles` e liberada nominalmente
-- por papel. Coluna nova nasce sem grant nenhum -- invisivel ate para quem le
-- a propria linha --, entao os `grant` abaixo nao sao zelo, sao obrigatorios.
--
-- O recorte segue exatamente o das colunas vizinhas (`funcao`, `login`):
--   - SELECT para anon, authenticated e service_role (o RLS continua decidindo
--     QUAIS linhas cada um enxerga; o grant so diz quais colunas existem);
--   - INSERT e UPDATE so para service_role.
--
-- Em particular, `authenticated` NAO recebe UPDATE. Quem edita perfil de
-- outra pessoa e `cadastros/usuarios/actions.ts`, que escreve com service_role
-- atras da checagem de `pode_administrar_usuarios()`. A unica coluna que a
-- propria pessoa altera continua sendo `nome_completo`.
-- ============================================================================

alter table public.profiles
  add column if not exists pais text not null default 'Brasil';

comment on column public.profiles.pais is
  'Pais do usuario. Espelha a coluna "Pais" da listagem do sistema de referencia; hoje constante "Brasil". Ver migration 0058.';

grant select (pais) on public.profiles to anon, authenticated, service_role;
grant insert (pais), update (pais) on public.profiles to service_role;
