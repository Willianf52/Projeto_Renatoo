-- ============================================================================
-- pgTAP -- "Qtd. minima de caracteres no campo Observacao" por checklist (0115)
--
--   1) Modelo novo nasce sem minimo proprio (nulo: vale o de Cadastros > Cliente).
--   2) O minimo aceita de 0 a 500 e recusa fora disso.
--   3) O GESTOR grava o minimo (grant por coluna) e o INSPETOR o le.
--   4) duplicar_modelo leva o minimo junto.
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001151', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001152', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001151';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001152';

insert into public.modelos_checklist (nome) values ('Modelo 0115');
insert into ids_teste select 'modelo', id from public.modelos_checklist where nome = 'Modelo 0115';

-- 1)
select is(
  (select min_caracteres_observacao from public.modelos_checklist where id = (select valor from ids_teste where chave = 'modelo')),
  null::smallint,
  'modelo novo nasce sem minimo proprio'
);

-- 2)
select throws_ok(
  $$ update public.modelos_checklist set min_caracteres_observacao = 501 where id = (select valor from ids_teste where chave = 'modelo') $$,
  '23514', null, 'minimo acima de 500 e recusado'
);

select throws_ok(
  $$ update public.modelos_checklist set min_caracteres_observacao = -1 where id = (select valor from ids_teste where chave = 'modelo') $$,
  '23514', null, 'minimo negativo e recusado'
);

-- 3)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001151", "role": "authenticated"}';

select lives_ok(
  $$ update public.modelos_checklist set min_caracteres_observacao = 20 where id = (select valor from ids_teste where chave = 'modelo') $$,
  'GESTOR grava o minimo do checklist'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001152", "role": "authenticated"}';

select is(
  (select min_caracteres_observacao from public.modelos_checklist where id = (select valor from ids_teste where chave = 'modelo')),
  20::smallint,
  'INSPETOR le o minimo (o app precisa dele)'
);

reset role;

-- 4)
insert into ids_teste
  select 'copia', public.duplicar_modelo((select valor from ids_teste where chave = 'modelo'), 'Copia 0115');

select is(
  (select min_caracteres_observacao from public.modelos_checklist where id = (select valor from ids_teste where chave = 'copia')),
  20::smallint,
  'duplicar leva o minimo junto'
);

select * from finish();
rollback;
