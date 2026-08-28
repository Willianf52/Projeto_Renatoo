-- ============================================================================
-- pgTAP — RLS de `importacoes`
--
-- Cobre a migration 0033 (escrita fechada para authenticated e anon -- so a
-- rota de importacao, com service_role, grava) e a 0044, que fechou a LEITURA
-- ao escopo da operacao.
--
-- O bloqueio de INSERT e de GRANT (herdado do default privilege que a
-- migration 0031 fechou antes desta tabela existir), nao so de RLS -- por
-- isso o erro esperado e 42501 (privilegio insuficiente), o mesmo padrao de
-- anon_nao_escreve_grupos_sites_test.sql.
--
-- SOBRE A LEITURA: ate a 0044 a policy era `using (true)` e este arquivo
-- afirmava, corretamente para a epoca, que "authenticated le importacoes". Era
-- o achado A-2 da auditoria de 28/08: `detalhe` pode conter e-mail de
-- funcionario e nomes de cadastro, e CLIENTE (conta de cliente externo) e
-- INSPETOR (conta de campo) liam a tabela inteira. Os asserts abaixo trocam
-- "qualquer autenticado le" pelos tres casos que a regra nova separa --
-- gestor le, cliente nao le, inspetor nao le.
--
-- Executado (2026-08-21) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual, mesma limitacao dos demais pgTAP deste projeto.
-- 3/3 asserts passaram; nada persistiu. Os asserts da 0044 (28/08) ainda nao
-- foram executados -- sem Docker no ambiente da auditoria, `pnpm test:db` nao
-- rodou; o job `banco` da CI e quem os exercita no PR.
-- ============================================================================

begin;

select plan(5);

set local role authenticated;

select throws_ok(
  $$ insert into public.importacoes (id_requisicao, origem, status, http_status)
     values ('teste', '127.0.0.1', 'sucesso', 200) $$,
  '42501',
  null,
  'authenticated nao insere em importacoes (grant fechado pela 0031)'
);

reset role;

-- Fixture: em producao so a rota (service_role) grava, mas o teste precisa de
-- uma linha para confirmar quem consegue le-la.
insert into public.importacoes (id_requisicao, origem, status, http_status, linhas_recebidas)
  values ('teste-fixture', '127.0.0.1', 'sucesso', 200, 10);

-- Tres identidades, uma por ramo da regra nova. `handle_new_user` (0008) cria
-- o perfil como OPERADOR inativo; cargo e `ativo` sao ajustados em seguida,
-- como nos demais testes deste diretorio.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.import@teste.local'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.import@teste.local'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.import@teste.local');

update public.profiles set ativo = true where id::text like 'd0000000%';
update public.profiles set cargo = 'GESTOR'   where id = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set cargo = 'CLIENTE'  where id = 'd0000000-0000-0000-0000-000000000002';
update public.profiles set cargo = 'INSPETOR' where id = 'd0000000-0000-0000-0000-000000000003';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select isnt_empty(
  $$ select 1 from public.importacoes where id_requisicao = 'teste-fixture' $$,
  'GESTOR ativo le importacoes (pode_ver_toda_operacao, migration 0044)'
);

-- O caso do achado A-2: conta de cliente externo, escopo estreito por desenho.
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.importacoes where id_requisicao = 'teste-fixture' $$,
  'CLIENTE nao le importacoes -- `detalhe` traz e-mail de funcionario (0044)'
);

-- O outro caso do A-2: conta de campo, num aparelho fora do escritorio.
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.importacoes where id_requisicao = 'teste-fixture' $$,
  'INSPETOR nao le importacoes (0044)'
);

reset role;

set local role anon;

select throws_ok(
  $$ insert into public.importacoes (id_requisicao, origem, status, http_status)
     values ('teste-anon', '127.0.0.1', 'sucesso', 200) $$,
  '42501',
  null,
  'anon nao insere em importacoes (grant fechado pela 0031)'
);

reset role;

select * from finish();

rollback;
