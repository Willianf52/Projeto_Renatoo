-- ============================================================================
-- VeloxLab — `pg_temp` no fim do search_path de todas as funcoes de `public`
--
-- Ultimo item de banco da auditoria de AppSec de 2026-08-23.
--
-- O PROBLEMA: as funcoes deste schema declaram `set search_path = public`. O
-- Postgres pesquisa o schema temporario ANTES do search_path explicito quando
-- `pg_temp` nao aparece na lista -- e so para relacoes (tabela, view,
-- sequence), que e exatamente o que estas funcoes referenciam sem qualificar
-- (`select cargo from public.profiles ...` esta qualificado, mas nem toda
-- referencia esta, e a garantia nao deve depender de auditar cada corpo).
--
-- Medido no mesmo dia: `authenticated` e `anon` tem privilegio TEMP neste
-- banco (`has_database_privilege(..., 'TEMP')` = true). Ou seja, o papel de
-- uma sessao consegue criar objeto temporario.
--
-- Colocar `pg_temp` por ULTIMO faz o schema temporario ser pesquisado depois
-- de `public`, tirando a possibilidade de um objeto temporario sombrear uma
-- tabela de verdade dentro de uma funcao `security definer` -- que rodaria com
-- os privilegios do dono. E a mitigacao que a propria documentacao do Postgres
-- recomenda para `SECURITY DEFINER`.
--
-- EXPLORABILIDADE HOJE: baixa. Criar objeto temporario exige executar
-- `CREATE TEMP TABLE`, e o PostgREST nao expoe SQL arbitrario; `authenticated`
-- tambem nao tem senha de login para conexao direta. Depende de uma primitiva
-- que hoje nao existe. Isto e hardening, nao correcao de brecha aberta.
--
-- ESCOPO: as 12 funcoes que ainda estavam com `search_path = public` --
-- 11 `security definer` mais `sincronizar_membros_grupo_usuarios`, que e
-- `security invoker`.
--
-- A invoker entra junto de proposito, embora o risco nela seja menor (roda
-- com os direitos de quem chama, entao sombrear nao escala privilegio):
-- deixa-la de fora tornaria a regra "toda funcao de public termina em
-- pg_temp" impossivel de afirmar sem excecao, e uma invariante com excecao e
-- uma invariante que ninguem verifica. O assert do pgTAP depende dessa
-- simplicidade.
--
-- `impedir_escalacao_de_perfil()` nao esta na lista: a 0039 ja a criou com
-- `public, pg_temp`.
--
-- `alter function ... set search_path` so troca a configuracao -- corpo,
-- dono, privilegios e volatilidade ficam intactos. Nao ha recriacao, entao
-- nenhum trigger ou policy que dependa destas funcoes e afetado.
--
-- Transacional: o `supabase db push` aplica cada arquivo dentro de uma
-- transacao, e nenhum comando aqui e dos que nao podem rodar em transacao
-- (nao ha `create index concurrently` nem `alter type ... add value`). Por
-- isso nao ha `begin`/`commit` explicito -- mesma convencao das 40 migrations
-- anteriores deste repositorio, e abrir um `begin` aninhado aqui faria o
-- `commit` fechar a transacao externa da CLI.
--
-- Idempotente: reaplicar grava a mesma configuracao.
-- ============================================================================

-- Auxiliares de RLS: as mais criticas, porque sao chamadas de dentro de
-- policy e rodam como `postgres`.
alter function public.usuario_ativo() set search_path = public, pg_temp;
alter function public.nivel_acesso_atual() set search_path = public, pg_temp;
alter function public.e_cliente() set search_path = public, pg_temp;
alter function public.e_inspetor() set search_path = public, pg_temp;
alter function public.pode_ver_toda_operacao() set search_path = public, pg_temp;
alter function public.pode_ver_grupo_site(id_do_grupo bigint) set search_path = public, pg_temp;
alter function public.pode_administrar_cadastros() set search_path = public, pg_temp;
alter function public.pode_administrar_grupos_usuarios() set search_path = public, pg_temp;
alter function public.pode_administrar_usuarios() set search_path = public, pg_temp;

-- Funcoes de trigger.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.registrar_auditoria() set search_path = public, pg_temp;

-- `security invoker` -- ver a nota de escopo no cabecalho.
alter function public.sincronizar_membros_grupo_usuarios(p_grupo_id bigint, p_membros uuid[])
  set search_path = public, pg_temp;
