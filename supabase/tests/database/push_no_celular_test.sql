-- ============================================================================
-- pgTAP -- push no celular (migration 0110)
--
--   1) A pessoa registra o aparelho; endereco invalido e recusado.
--   2) Outra pessoa no mesmo aparelho passa a ser a dona do endereco.
--   3) Cada um ve so os proprios aparelhos; ninguem grava direto na tabela.
--   4) Criar um aviso para quem tem aparelho nao falha (o envio e assincrono).
-- ============================================================================

begin;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push.ana@teste.local'),
  ('f0000000-0000-0000-0000-000000001102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push.bia@teste.local');
update public.profiles set ativo = true, cargo = 'INSPETOR' where id::text like 'f0000000-0000-0000-0000-00000000110_';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001101", "role": "authenticated"}';

select lives_ok(
  $$ select public.registrar_dispositivo_push('ExponentPushToken[abcdefghij0123456789]', 'android') $$,
  'a pessoa registra o proprio aparelho'
);

select throws_ok(
  $$ select public.registrar_dispositivo_push('nao-e-um-endereco', 'android') $$,
  '23514', null,
  'endereco de push invalido e recusado'
);

select throws_ok(
  $$ insert into public.dispositivos_push (token, usuario_id)
     values ('ExponentPushToken[zzzzzzzzzz0123456789]', 'f0000000-0000-0000-0000-000000001101') $$,
  '42501', null,
  'ninguem grava direto na tabela'
);

-- 2) A Bia entra no mesmo aparelho
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001102", "role": "authenticated"}';
select public.registrar_dispositivo_push('ExponentPushToken[abcdefghij0123456789]', 'android');

select is(
  (select count(*)::int from public.dispositivos_push),
  1,
  'a Bia ve o aparelho, que agora e dela'
);

-- 3) A Ana nao ve mais o aparelho
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001101", "role": "authenticated"}';
select is(
  (select count(*)::int from public.dispositivos_push),
  0,
  'a Ana nao ve o aparelho de outra pessoa'
);

reset role;

select is(
  (select usuario_id from public.dispositivos_push where token = 'ExponentPushToken[abcdefghij0123456789]'),
  'f0000000-0000-0000-0000-000000001102'::uuid,
  'o endereco ficou com quem entrou por ultimo'
);

-- 4) O aviso para quem tem aparelho nasce normalmente
select is(
  manutencao.notificar(array['f0000000-0000-0000-0000-000000001102']::uuid[], 'TESTE', 'Aviso com push', 'Texto', null, 'teste:0110'),
  1,
  'criar um aviso para quem tem aparelho nao falha'
);

select * from finish();
rollback;
