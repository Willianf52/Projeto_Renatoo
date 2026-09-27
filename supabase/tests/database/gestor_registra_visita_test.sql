-- ============================================================================
-- pgTAP — GESTOR tambem registra visita e leitura (0060)
--
--   1) GESTOR grava visita em nome proprio.
--   2) GESTOR grava leitura, com o QR do site, na propria visita.
--   3) GESTOR nao grava visita em nome de outro funcionario.
--   4) GESTOR nao grava leitura na visita de um INSPETOR.
--   5) A amarra da 0054 vale para o GESTOR: QR de outro site e recusado pelo
--      trigger, nao pelo RLS.
--   6) GESTOR inativo nao grava visita.
--   7) SUPERVISOR continua sem escrita de campo -- so GESTOR entrou.
--   8) INSPETOR continua gravando a propria visita (o caminho dele nao mudou).
--   9) INSPETOR continua sem gravar leitura na visita do GESTOR.
--
-- Ids de linha alheia vao para `ids_teste` (sem RLS) antes de trocar de role,
-- pelo motivo registrado em `checklist_de_visitas_test.sql`.
-- ============================================================================

begin;

select plan(9);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0600000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g60.gestor@teste.local'),
  ('f0600000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g60.inspetor@teste.local'),
  ('f0600000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g60.gestor.inativo@teste.local'),
  ('f0600000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g60.supervisor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'f0600000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0600000-0000-0000-0000-000000000002';
update public.profiles set ativo = false, cargo = 'GESTOR'
  where id = 'f0600000-0000-0000-0000-000000000003';
update public.profiles set ativo = true, cargo = 'SUPERVISOR'
  where id = 'f0600000-0000-0000-0000-000000000004';

insert into public.grupos_sites (nome) values ('Grupo 0060');
insert into public.sites (grupo_site_id, nome)
  select id, n from public.grupos_sites, unnest(array['Site A 0060', 'Site B 0060']) as n
  where nome = 'Grupo 0060';
insert into public.qr_codes (site_id, codigo)
  select id, 'QR-A-0060' from public.sites where nome = 'Site A 0060';
insert into public.qr_codes (site_id, codigo)
  select id, 'QR-B-0060' from public.sites where nome = 'Site B 0060';

insert into ids_teste (chave, valor)
  select 'site_a', id from public.sites where nome = 'Site A 0060'
  union all select 'qr_a', id from public.qr_codes where codigo = 'QR-A-0060'
  union all select 'qr_b', id from public.qr_codes where codigo = 'QR-B-0060';

-- Uma visita do INSPETOR, para as tentativas do gestor em visita alheia.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0600000-0000-0000-0000-000000000002", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0060-inspetor', id, 'f0600000-0000-0000-0000-000000000002'
  from public.sites where nome = 'Site A 0060';

reset role;
insert into ids_teste (chave, valor) select 'v_inspetor', id from public.visitas where numero_coleta = '0060-inspetor';

-- ---------------------------------------------------------------------------
-- 1-5) GESTOR ativo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0600000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0060-gestor', %L, 'f0600000-0000-0000-0000-000000000001') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  'GESTOR grava visita em nome proprio'
);

reset role;
insert into ids_teste (chave, valor) select 'v_gestor', id from public.visitas where numero_coleta = '0060-gestor';
set local role authenticated;

select lives_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora, qr_code_id) values (%L, now(), %L) $$,
    (select valor from ids_teste where chave = 'v_gestor'),
    (select valor from ids_teste where chave = 'qr_a')
  ),
  'GESTOR grava leitura com o QR do site na propria visita'
);

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0060-forjada', %L, 'f0600000-0000-0000-0000-000000000002') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  '42501',
  null,
  'GESTOR nao grava visita em nome de outro funcionario'
);

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now()) $$,
    (select valor from ids_teste where chave = 'v_inspetor')
  ),
  '42501',
  null,
  'GESTOR nao grava leitura na visita de um INSPETOR'
);

-- throws_like: 42501 tambem e o codigo do RLS, e o que se prova aqui e que o
-- trigger da 0054 segurou.
select throws_like(
  format(
    $$ insert into public.leituras (visita_id, data_hora, qr_code_id) values (%L, now() + interval '1 minute', %L) $$,
    (select valor from ids_teste where chave = 'v_gestor'),
    (select valor from ids_teste where chave = 'qr_b')
  ),
  '%nao pertence ao site da visita%',
  'GESTOR nao pendura QR-code de outro site na visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6) GESTOR inativo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0600000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0060-inativo', %L, 'f0600000-0000-0000-0000-000000000003') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  '42501',
  null,
  'GESTOR inativo nao grava visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7) SUPERVISOR.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0600000-0000-0000-0000-000000000004", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0060-supervisor', %L, 'f0600000-0000-0000-0000-000000000004') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  '42501',
  null,
  'SUPERVISOR continua sem gravar visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 8-9) INSPETOR.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0600000-0000-0000-0000-000000000002", "role": "authenticated"}';

select lives_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0060-inspetor-2', %L, 'f0600000-0000-0000-0000-000000000002') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  'INSPETOR continua gravando a propria visita'
);

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now()) $$,
    (select valor from ids_teste where chave = 'v_gestor')
  ),
  '42501',
  null,
  'INSPETOR nao grava leitura na visita do GESTOR'
);

reset role;

select * from finish();
rollback;
