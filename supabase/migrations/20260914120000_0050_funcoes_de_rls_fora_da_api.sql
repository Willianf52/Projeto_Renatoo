-- ============================================================================
-- VeloxLab — funcoes de RLS fora do schema exposto pela API (P2-1)
--
-- Auditoria de 11/09, P2-1; decisao que estava aberta desde a varredura de
-- AppSec de 31/08.
--
-- O ACHADO: o advisor `0029_authenticated_security_definer_function_executable`
-- lista dez funcoes `security definer` de `public` chamaveis por
-- `authenticated` em `/rest/v1/rpc/<nome>`. Sao as auxiliares de RLS:
-- usuario_ativo, nivel_acesso_atual, e_cliente, e_inspetor,
-- pode_ver_toda_operacao, pode_ver_grupo_site, pode_ver_visita,
-- pode_administrar_cadastros, pode_administrar_usuarios e
-- pode_administrar_grupos_usuarios.
--
-- O RISCO ERA CONTIDO: todas respondem sobre o PROPRIO chamador (ou, nas duas
-- com argumento, se ele ve um grupo/visita), nunca devolvem dado de terceiro.
-- `pode_ver_visita(id)` e a unica que chegava perto de um oraculo -- "existe
-- visita N que eu nao posso ver?" responde `false` para as duas perguntas, mas
-- nao deveria nem estar na superficie.
--
-- A CORRECAO: as dez vao para o schema `autorizacao`, que o PostgREST nao
-- expoe (`supabase/config.toml`: `schemas = ["public", "graphql_public"]`).
--
-- POR QUE NADA QUEBRA:
--
--   - POLICIES: guardam a funcao por OID, nao por nome. `alter function ...
--     set schema` preserva o OID, entao as ~60 policies seguem chamando a
--     mesma funcao -- `pg_policies` passa a exibi-las como `autorizacao.x()`.
--
--   - CORPOS QUE CHAMAM PELO NOME: funcao `language sql` nao atomica e
--     plpgsql guardam o corpo como TEXTO e resolvem o nome na execucao. Medido
--     em producao hoje, sao nove auxiliares chamando umas as outras e o
--     trigger `impedir_escalacao_de_perfil` chamando `pode_administrar_usuarios`.
--     Todas ganham `autorizacao` no `search_path`. Nenhuma outra funcao do
--     banco (inclusive as `relatorio_*` da 0049) as referencia.
--
--   - O PAINEL CHAMA QUATRO POR RPC: `lib/permissoes.ts` usa
--     `pode_administrar_cadastros`, `pode_administrar_usuarios` e
--     `pode_administrar_grupos_usuarios`; `cadastros/usuarios/queries.ts` usa
--     `pode_ver_toda_operacao`. Para essas quatro fica em `public` um
--     envelope `security invoker` de mesmo nome e mesmo retorno. O advisor
--     0029 nao se aplica a invoker, e a pergunta que o envelope responde e a
--     que a tela precisa fazer ("eu posso?"). As outras seis saem da API.
--
-- PRIVILEGIOS: `alter function ... set schema` leva junto a ACL (postgres,
-- authenticated e service_role com EXECUTE; `anon` ja fora desde a 0027).
-- O schema novo so da USAGE a `authenticated` e `service_role` -- sem ela, a
-- policy avaliada por `authenticated` falharia com "permission denied for
-- schema".
--
-- DAQUI PARA A FRENTE: policy nova deve chamar `autorizacao.x()`
-- qualificado. `x()` sem schema ainda resolveria para o envelope de `public`
-- nas quatro que o tem (e funcionaria, com uma chamada a mais), e para nada
-- nas outras seis.
--
-- Fora do escopo: o outro achado do P2-1, leaked password protection do
-- GoTrue, e configuracao de painel e exige plano Pro. O painel web ja barra
-- senha vazada em `/api/senha/verificar-vazamento`.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao registrada na
-- 0041.
-- ============================================================================

create schema if not exists autorizacao;

revoke all on schema autorizacao from public;
grant usage on schema autorizacao to authenticated, service_role;

comment on schema autorizacao is
  'Auxiliares de RLS (security definer). Fora de PostgREST de proposito -- ver migration 0050.';

-- ---------------------------------------------------------------------------
-- 1) As dez auxiliares mudam de schema
-- ---------------------------------------------------------------------------
alter function public.usuario_ativo() set schema autorizacao;
alter function public.nivel_acesso_atual() set schema autorizacao;
alter function public.e_cliente() set schema autorizacao;
alter function public.e_inspetor() set schema autorizacao;
alter function public.pode_ver_toda_operacao() set schema autorizacao;
alter function public.pode_ver_grupo_site(id_do_grupo bigint) set schema autorizacao;
alter function public.pode_ver_visita(id_da_visita bigint) set schema autorizacao;
alter function public.pode_administrar_cadastros() set schema autorizacao;
alter function public.pode_administrar_usuarios() set schema autorizacao;
alter function public.pode_administrar_grupos_usuarios() set schema autorizacao;

-- ---------------------------------------------------------------------------
-- 2) Quem chama pelo nome passa a enxergar `autorizacao`
--
-- `pg_temp` continua por ultimo (0041). `autorizacao` vem antes de `public`
-- para o nome nao resolver para o envelope invoker da secao 3.
-- ---------------------------------------------------------------------------
alter function autorizacao.usuario_ativo() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.nivel_acesso_atual() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.e_cliente() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.e_inspetor() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_ver_toda_operacao() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_ver_grupo_site(id_do_grupo bigint) set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_ver_visita(id_da_visita bigint) set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_administrar_cadastros() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_administrar_usuarios() set search_path = autorizacao, public, pg_temp;
alter function autorizacao.pode_administrar_grupos_usuarios() set search_path = autorizacao, public, pg_temp;

alter function public.impedir_escalacao_de_perfil() set search_path = autorizacao, public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3) Envelopes em `public` para as quatro que o painel chama por RPC
--
-- `security invoker`: rodam com os direitos de quem chama, e o que eles
-- chamam e a funcao de `autorizacao`, que ja responde so sobre o chamador.
-- Mesmo nome, mesma assinatura e mesmo retorno -- `supabase.rpc(...)` e
-- `database.types.ts` nao mudam para elas.
-- ---------------------------------------------------------------------------
create function public.pode_administrar_cadastros()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select autorizacao.pode_administrar_cadastros() $$;

create function public.pode_administrar_usuarios()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select autorizacao.pode_administrar_usuarios() $$;

create function public.pode_administrar_grupos_usuarios()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select autorizacao.pode_administrar_grupos_usuarios() $$;

create function public.pode_ver_toda_operacao()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select autorizacao.pode_ver_toda_operacao() $$;

-- O default privilege do Supabase da EXECUTE a `anon` em funcao nova de
-- `public`; a 0027 ja tinha fechado isso para as originais.
revoke all on function public.pode_administrar_cadastros() from public, anon;
revoke all on function public.pode_administrar_usuarios() from public, anon;
revoke all on function public.pode_administrar_grupos_usuarios() from public, anon;
revoke all on function public.pode_ver_toda_operacao() from public, anon;

grant execute on function public.pode_administrar_cadastros() to authenticated, service_role;
grant execute on function public.pode_administrar_usuarios() to authenticated, service_role;
grant execute on function public.pode_administrar_grupos_usuarios() to authenticated, service_role;
grant execute on function public.pode_ver_toda_operacao() to authenticated, service_role;
