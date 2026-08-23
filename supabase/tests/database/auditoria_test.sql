-- ============================================================================
-- pgTAP — tabela de auditoria (migration 0034)
--
-- Cobre duas coisas separadas:
--
--   1) O trigger `registrar_auditoria()` grava INSERT/UPDATE/DELETE em
--      `grupos_usuarios` com o `ator_id` correto (auth.uid() de quem chamou)
--      e o par dados_antigos/dados_novos certo para cada operação.
--      `grupos_usuarios`, e não `grupos_sites`, porque é a única das quatro
--      tabelas com trigger que tem policy de DELETE (migration 0020) -- as
--      outras (`sites`, `grupos_sites`, `qr_codes`) só desativam por flag.
--      Testar DELETE contra uma delas apagaria zero linhas em silêncio (RLS
--      nega por ausência de policy, sem erro) e o assert passaria pelo motivo
--      errado -- achado na primeira tentativa deste teste, ver o commit.
--   2) A policy de leitura: só quem `pode_administrar_usuarios()` (GESTOR
--      ativo) lê `auditoria`; e ninguém -- nem `authenticated`, nem `anon` --
--      escreve nela direto, grant fechado pela própria migration.
--
-- Não cobre `profiles`: essa tabela não ganha o trigger de propósito (ver o
-- cabeçalho da 0034) -- é gravada explicitamente por `usuarios/actions.ts`,
-- que não tem como ser exercitado por um teste de banco isolado.
--
-- Executado (2026-08-21) direto contra o projeto Supabase de produção, dentro
-- de uma transação com rollback -- branch de desenvolvimento não está
-- disponível no plano atual. 8/8 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(8);

-- Fixture: um GESTOR (escreve grupos_usuarios e lê auditoria) e um OPERADOR
-- (não administra usuários -- prova que a leitura é mesmo restrita).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.auditoria@teste.local'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.auditoria@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'd0000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- INSERT: o trigger grava tabela/operacao/ator_id certos.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.grupos_usuarios (nome) values ('Grupo Auditoria Teste');

select results_eq(
  $$ select tabela, operacao, ator_id::text
     from public.auditoria
     where dados_novos ->> 'nome' = 'Grupo Auditoria Teste' and operacao = 'INSERT' $$,
  $$ values ('grupos_usuarios'::text, 'INSERT'::text, 'd0000000-0000-0000-0000-000000000001'::text) $$,
  'INSERT em grupos_usuarios gera linha com tabela/operacao/ator_id corretos'
);

-- ---------------------------------------------------------------------------
-- UPDATE: dados_antigos e dados_novos capturam o antes e o depois.
-- ---------------------------------------------------------------------------
update public.grupos_usuarios set nome = 'Grupo Auditoria Editado' where nome = 'Grupo Auditoria Teste';

select is(
  (select dados_antigos ->> 'nome' from public.auditoria
   where operacao = 'UPDATE' and dados_novos ->> 'nome' = 'Grupo Auditoria Editado'),
  'Grupo Auditoria Teste',
  'UPDATE grava o nome antigo em dados_antigos'
);

select is(
  (select dados_novos ->> 'nome' from public.auditoria
   where operacao = 'UPDATE' and dados_antigos ->> 'nome' = 'Grupo Auditoria Teste'),
  'Grupo Auditoria Editado',
  'UPDATE grava o nome novo em dados_novos'
);

-- ---------------------------------------------------------------------------
-- DELETE: dados_antigos preservado, dados_novos nulo.
-- ---------------------------------------------------------------------------
delete from public.grupos_usuarios where nome = 'Grupo Auditoria Editado';

select is(
  (select dados_antigos ->> 'nome' from public.auditoria
   where operacao = 'DELETE' and dados_antigos ->> 'nome' = 'Grupo Auditoria Editado'),
  'Grupo Auditoria Editado',
  'DELETE preserva a linha antiga em dados_antigos'
);

select is(
  (select dados_novos from public.auditoria
   where operacao = 'DELETE' and dados_antigos ->> 'nome' = 'Grupo Auditoria Editado'),
  null,
  'DELETE nao tem "depois" -- dados_novos fica nulo'
);

reset role;

-- ---------------------------------------------------------------------------
-- Leitura: só GESTOR (pode_administrar_usuarios()) enxerga auditoria.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select ok(
  (select count(*) from public.auditoria where tabela = 'grupos_usuarios') > 0,
  'GESTOR le as linhas de auditoria geradas acima'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count(*)::int from public.auditoria),
  0,
  'OPERADOR (nao administra usuarios) nao le nada em auditoria'
);

reset role;

-- ---------------------------------------------------------------------------
-- Escrita: fechada para authenticated e anon, mesmo padrao das demais tabelas
-- sem policy de escrita (grant fechado pela 0031/pela propria 0034).
-- ---------------------------------------------------------------------------
set local role authenticated;

select throws_ok(
  $$ insert into public.auditoria (tabela, registro_id, operacao)
     values ('teste', '1', 'INSERT') $$,
  '42501',
  null,
  'authenticated nao insere em auditoria (grant fechado)'
);

reset role;

select * from finish();

rollback;
