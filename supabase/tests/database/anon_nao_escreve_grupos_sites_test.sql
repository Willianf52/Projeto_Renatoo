-- ============================================================================
-- pgTAP — anon não escreve em grupos_sites
--
-- Cobre a migration 0010: os grants padrao que o Supabase deixa para `anon`
-- foram revogados explicitamente, para que uma policy futura sem `to
-- authenticated` nao libere escrita por acidente (public por padrao inclui
-- anon). O bloqueio aqui e de GRANT, nao so de RLS -- por isso o INSERT
-- lanca erro de privilegio (42501) antes mesmo da policy ser avaliada.
--
-- Executado (2026-08-11) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual. 2/2 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(2);

set local role anon;

select throws_ok(
  $$ insert into public.grupos_sites (nome) values ('Grupo criado por anon') $$,
  '42501',
  null,
  'anon nao insere em grupos_sites (grant revogado na migration 0010)'
);

reset role;

-- Fixture para o UPDATE: precisa existir uma linha antes de tentar alterar.
insert into public.grupos_sites (nome) values ('Grupo existente para o teste');

set local role anon;

select throws_ok(
  $$ update public.grupos_sites set nome = 'Renomeado por anon' where nome = 'Grupo existente para o teste' $$,
  '42501',
  null,
  'anon nao atualiza grupos_sites (grant revogado na migration 0010)'
);

reset role;

select * from finish();

rollback;
