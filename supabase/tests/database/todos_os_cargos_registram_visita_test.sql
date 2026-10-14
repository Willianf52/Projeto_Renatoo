-- ============================================================================
-- pgTAP -- todos os cargos, menos CLIENTE, enviam inspecao pelo app (0069)
--
--   1) INSPETOR continua gravando a propria visita (o caminho dele nao mudou).
--   2) SUPERVISOR grava a propria visita e a propria leitura.
--   3) OPERACIONAL grava a propria visita e a propria leitura.
--   4) OPERADOR grava a propria visita e a propria leitura.
--   5) OPERADOR grava o checklist da PROPRIA visita (pode_finalizar_visita).
--   6) pode_finalizar_visita e verdadeira para o dono da visita, SUPERVISOR.
--   7) pode_finalizar_visita e falsa para OPERADOR numa visita de outra
--      pessoa: so o GESTOR fecha visita alheia.
--   8) CLIENTE continua sem gravar visita.
--   9) OPERADOR inativo continua sem gravar visita.
--  10) OPERADOR nao grava visita em nome de outra pessoa.
--  11) OPERADOR nao grava checklist em visita que nao e dele.
--
-- Ids de linha alheia vao para `ids_teste` (sem RLS) antes de trocar de role,
-- pelo motivo registrado em `checklist_de_visitas_test.sql`: sem isso a policy
-- de SELECT esconde a linha e o teste passa pelo motivo errado.
--
-- Nao cobre o upload de midia no bucket: a policy de storage usa a mesma
-- `pode_finalizar_visita` e ja tem cobertura em
-- `midia_do_checklist_amarrada_a_visita_test.sql` e
-- `gestor_finaliza_visita_test.sql`.
-- ============================================================================

begin;

select plan(11);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture: um de cada cargo que importa, mais um OPERADOR inativo e um site
-- minimo para a visita/leitura terem onde pendurar.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0690000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.supervisor@teste.local'),
  ('f0690000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.operacional@teste.local'),
  ('f0690000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.operador@teste.local'),
  ('f0690000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.cliente@teste.local'),
  ('f0690000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.operador.inativo@teste.local'),
  ('f0690000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g69.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'SUPERVISOR'
  where id = 'f0690000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'OPERACIONAL'
  where id = 'f0690000-0000-0000-0000-000000000002';
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'f0690000-0000-0000-0000-000000000003';
update public.profiles set ativo = true, cargo = 'CLIENTE'
  where id = 'f0690000-0000-0000-0000-000000000004';
update public.profiles set ativo = false, cargo = 'OPERADOR'
  where id = 'f0690000-0000-0000-0000-000000000005';
update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0690000-0000-0000-0000-000000000006';

insert into public.grupos_sites (nome) values ('Grupo 0069');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0069' from public.grupos_sites where nome = 'Grupo 0069';

insert into ids_teste (chave, valor)
  select 'site', id from public.sites where nome = 'Site 0069';

-- ---------------------------------------------------------------------------
-- 1) INSPETOR continua gravando a propria visita.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000006", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0069-inspetor', s.id, 'f0690000-0000-0000-0000-000000000006'
  from public.sites s where s.nome = 'Site 0069';

select is(
  (select count(*)::int from public.visitas where numero_coleta = '0069-inspetor'),
  1,
  'INSPETOR continua gravando a propria visita'
);

reset role;

insert into ids_teste (chave, valor) select 'v_inspetor', id from public.visitas where numero_coleta = '0069-inspetor';

-- ---------------------------------------------------------------------------
-- 2) SUPERVISOR grava a propria visita e a propria leitura.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0069-supervisor', s.id, 'f0690000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site 0069';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0069-supervisor';

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0069-supervisor'),
  1,
  'SUPERVISOR grava a propria visita e a propria leitura'
);

reset role;

insert into ids_teste (chave, valor) select 'v_supervisor', id from public.visitas where numero_coleta = '0069-supervisor';

-- ---------------------------------------------------------------------------
-- 3) OPERACIONAL grava a propria visita e a propria leitura.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000002", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0069-operacional', s.id, 'f0690000-0000-0000-0000-000000000002'
  from public.sites s where s.nome = 'Site 0069';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0069-operacional';

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0069-operacional'),
  1,
  'OPERACIONAL grava a propria visita e a propria leitura'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4) OPERADOR grava a propria visita e a propria leitura.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000003", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0069-operador', s.id, 'f0690000-0000-0000-0000-000000000003'
  from public.sites s where s.nome = 'Site 0069';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0069-operador';

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = '0069-operador'),
  1,
  'OPERADOR grava a propria visita e a propria leitura'
);

-- ---------------------------------------------------------------------------
-- 5) OPERADOR grava o checklist da propria visita.
-- ---------------------------------------------------------------------------
insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
  from public.visitas v where v.numero_coleta = '0069-operador';

select is(
  (select count(*)::int from public.checklists_visita c join public.visitas v on v.id = c.visita_id where v.numero_coleta = '0069-operador'),
  1,
  'OPERADOR grava o checklist da propria visita'
);

-- ---------------------------------------------------------------------------
-- 7) pode_finalizar_visita e falsa para o OPERADOR numa visita de outra pessoa
-- (ainda na sessao do OPERADOR).
-- ---------------------------------------------------------------------------
select is(
  autorizacao.pode_finalizar_visita((select valor from ids_teste where chave = 'v_inspetor')),
  false,
  'pode_finalizar_visita e falsa para OPERADOR numa visita de outra pessoa'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6) pode_finalizar_visita e verdadeira para o SUPERVISOR na propria visita.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000001", "role": "authenticated"}';

select is(
  autorizacao.pode_finalizar_visita((select valor from ids_teste where chave = 'v_supervisor')),
  true,
  'pode_finalizar_visita e verdadeira para SUPERVISOR na propria visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 8) CLIENTE continua sem gravar visita.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000004", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0069-cliente', %L, 'f0690000-0000-0000-0000-000000000004') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '42501',
  null,
  'CLIENTE continua sem gravar visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 9) OPERADOR inativo continua sem gravar visita.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000005", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0069-inativo', %L, 'f0690000-0000-0000-0000-000000000005') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '42501',
  null,
  'OPERADOR inativo continua sem gravar visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 10) OPERADOR nao grava visita em nome de outra pessoa.
-- 11) OPERADOR nao grava checklist em visita que nao e dele.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0690000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0069-forjada', %L, 'f0690000-0000-0000-0000-000000000006') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '42501',
  null,
  'OPERADOR nao grava visita em nome de outra pessoa'
);

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, assinatura_path)
       values (%1$L, 'CONSULTORIA', '%1$s/x.png') $$,
    (select valor from ids_teste where chave = 'v_inspetor')
  ),
  '42501',
  null,
  'OPERADOR nao grava checklist em visita que nao e dele'
);

reset role;

select * from finish();

rollback;
