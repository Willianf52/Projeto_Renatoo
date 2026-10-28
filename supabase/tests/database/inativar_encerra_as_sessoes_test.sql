-- ============================================================================
-- pgTAP — Inativar encerra as sessoes (migration 0078)
--
--   1) A funcao mora em manutencao, e security definer, e a sessao nao a executa.
--   2) Inativar apaga as sessoes da conta...
--   3) ... e os refresh tokens, inclusive o sem sessao.
--   4) As sessoes de outra conta ficam.
--   5) Editar outra coluna de uma conta ativa nao encerra nada.
--   6) Reativar nao falha e nao apaga a sessao nova.
--   7) O contador de checklists tem RLS.
-- ============================================================================

begin;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0780000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't78.inativado@teste.local'),
  ('f0780000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't78.colega@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0780000-0000-0000-0000-000000000001', 'f0780000-0000-0000-0000-000000000002');

insert into auth.sessions (id, user_id)
values
  ('f0780000-0000-0000-0000-0000000000a1', 'f0780000-0000-0000-0000-000000000001'),
  ('f0780000-0000-0000-0000-0000000000a2', 'f0780000-0000-0000-0000-000000000002');

insert into auth.refresh_tokens (token, user_id, session_id, revoked)
values
  ('t78-com-sessao', 'f0780000-0000-0000-0000-000000000001', 'f0780000-0000-0000-0000-0000000000a1', false),
  ('t78-sem-sessao', 'f0780000-0000-0000-0000-000000000001', null, false),
  ('t78-do-colega', 'f0780000-0000-0000-0000-000000000002', 'f0780000-0000-0000-0000-0000000000a2', false);

-- 1) Funcao
select ok(
  (select p.prosecdef and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'manutencao' and p.proname = 'encerrar_sessoes_ao_inativar'),
  'encerrar_sessoes_ao_inativar mora em manutencao, e security definer e authenticated nao executa'
);

-- 5) Outra coluna, conta ativa
update public.profiles set nome_completo = 'Teste 0078'
  where id = 'f0780000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from auth.sessions where user_id = 'f0780000-0000-0000-0000-000000000001'),
  1,
  'Editar outra coluna de uma conta ativa nao encerra a sessao'
);

-- 2) e 3) Inativar
update public.profiles set ativo = false
  where id = 'f0780000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from auth.sessions where user_id = 'f0780000-0000-0000-0000-000000000001'),
  0,
  'Inativar apaga as sessoes da conta'
);

select is(
  (select count(*)::int from auth.refresh_tokens where user_id = 'f0780000-0000-0000-0000-000000000001'),
  0,
  'Inativar apaga os refresh tokens da conta, inclusive o sem sessao'
);

-- 4) Colega
select is(
  (select count(*)::int from auth.refresh_tokens where user_id = 'f0780000-0000-0000-0000-000000000002'),
  1,
  'As sessoes de outra conta ficam'
);

-- 6) Reativar
insert into auth.sessions (id, user_id)
values ('f0780000-0000-0000-0000-0000000000a3', 'f0780000-0000-0000-0000-000000000001');

select lives_ok(
  $$update public.profiles set ativo = true where id = 'f0780000-0000-0000-0000-000000000001'$$,
  'Reativar nao falha'
);

select is(
  (select count(*)::int from auth.sessions where user_id = 'f0780000-0000-0000-0000-000000000001'),
  1,
  'Reativar nao apaga a sessao nova'
);

-- 7) Contador
select ok(
  (select c.relrowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'manutencao' and c.relname = 'contador_de_checklists'),
  'manutencao.contador_de_checklists tem RLS'
);

select * from finish();

rollback;
