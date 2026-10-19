-- ============================================================================
-- pgTAP -- todos os cargos, menos CLIENTE, veem as coletas de todos (0075)
--
-- A visita e a leitura sao do INSPETOR A. Cada cargo abaixo e OUTRA pessoa:
--
--   1) INSPETOR B ve a visita e a leitura de A.
--   2) OPERADOR ve a visita e a leitura de A.
--   3) OPERACIONAL ve a visita e a leitura de A.
--   4) CLIENTE sem grupo vinculado continua sem ver nada (o recorte nao vaza).
--   5) OPERADOR inativo continua sem ver nada.
--
-- A fixture entra como dono do banco (antes de trocar de role): a visita e a
-- leitura ja existem quando cada cargo olha, e o teste nao depende de quem tem
-- direito de gravar.
-- ============================================================================

begin;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0750000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.inspetor.a@teste.local'),
  ('f0750000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.inspetor.b@teste.local'),
  ('f0750000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.operador@teste.local'),
  ('f0750000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.operacional@teste.local'),
  ('f0750000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.cliente@teste.local'),
  ('f0750000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g75.operador.inativo@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0750000-0000-0000-0000-000000000001', 'f0750000-0000-0000-0000-000000000002');
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'f0750000-0000-0000-0000-000000000003';
update public.profiles set ativo = true, cargo = 'OPERACIONAL'
  where id = 'f0750000-0000-0000-0000-000000000004';
update public.profiles set ativo = true, cargo = 'CLIENTE'
  where id = 'f0750000-0000-0000-0000-000000000005';
update public.profiles set ativo = false, cargo = 'OPERADOR'
  where id = 'f0750000-0000-0000-0000-000000000006';

insert into public.grupos_sites (nome) values ('Grupo 0075');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0075' from public.grupos_sites where nome = 'Grupo 0075';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0075-a', s.id, 'f0750000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site 0075';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0075-a';

-- ---------------------------------------------------------------------------
-- 1) INSPETOR B ve a coleta de A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0750000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0075-a'),
  1,
  'INSPETOR ve a visita de outro inspetor'
);
select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0075-a'),
  1,
  'INSPETOR ve a leitura de outro inspetor'
);

-- ---------------------------------------------------------------------------
-- 2) OPERADOR.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0750000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0075-a'),
  1,
  'OPERADOR ve a visita de um inspetor'
);
select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0075-a'),
  1,
  'OPERADOR ve a leitura de um inspetor'
);

-- ---------------------------------------------------------------------------
-- 3) OPERACIONAL.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0750000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0075-a'),
  1,
  'OPERACIONAL ve a visita de um inspetor'
);
select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0075-a'),
  1,
  'OPERACIONAL ve a leitura de um inspetor'
);

-- ---------------------------------------------------------------------------
-- 4) CLIENTE sem grupo vinculado: o recorte do cliente nao vaza.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0750000-0000-0000-0000-000000000005", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0075-a'),
  0,
  'CLIENTE sem grupo vinculado nao ve a visita'
);
select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0075-a'),
  0,
  'CLIENTE sem grupo vinculado nao ve a leitura'
);

-- ---------------------------------------------------------------------------
-- 5) OPERADOR inativo.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0750000-0000-0000-0000-000000000006", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0075-a'),
  0,
  'OPERADOR inativo nao ve a visita'
);
select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0075-a'),
  0,
  'OPERADOR inativo nao ve a leitura'
);

reset role;

select * from finish();

rollback;
