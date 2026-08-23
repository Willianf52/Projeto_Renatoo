-- ============================================================================
-- pgTAP — RLS de `importacoes`
--
-- Cobre a migration 0033: leitura liberada para authenticated, escrita
-- fechada para authenticated e anon -- so a rota de importacao (service_role)
-- grava. O bloqueio de INSERT e de GRANT (herdado do default privilege que a
-- migration 0031 fechou antes desta tabela existir), nao so de RLS -- por
-- isso o erro esperado e 42501 (privilegio insuficiente), o mesmo padrao de
-- anon_nao_escreve_grupos_sites_test.sql.
--
-- Executado (2026-08-21) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual, mesma limitacao dos demais pgTAP deste projeto.
-- 3/3 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(3);

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
-- uma linha para confirmar que authenticated consegue le-la.
insert into public.importacoes (id_requisicao, origem, status, http_status, linhas_recebidas)
  values ('teste-fixture', '127.0.0.1', 'sucesso', 200, 10);

set local role authenticated;

select isnt_empty(
  $$ select 1 from public.importacoes where id_requisicao = 'teste-fixture' $$,
  'authenticated le importacoes (policy de select da migration 0033)'
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
