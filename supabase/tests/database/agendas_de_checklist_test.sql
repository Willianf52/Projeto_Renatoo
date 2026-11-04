-- ============================================================================
-- pgTAP -- agendas de checklist (migration 0084)
--
--   1) salvar_agenda grava a agenda e os sites; sem site, recusa (22023).
--   2) agendamentos_do_periodo: uma agenda SEMANAL de 14 dias atras ate 7 dias
--      a frente, tolerancia de 2 dias, gera 4 datas com os 4 status --
--      FINALIZADO (checklist do modelo no site dentro da tolerancia),
--      ATRASADO, NO_PRAZO e AGENDADO.
--   3) O INSPETOR nao le agendas nem escreve (RLS).
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000841', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ag.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000842', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ag.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000841';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000842';

insert into public.grupos_sites (nome) values ('Grupo Agenda 0084');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Agenda 0084' from public.grupos_sites where nome = 'Grupo Agenda 0084';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Agenda 0084';

insert into public.modelos_checklist (nome) values ('Modelo Agenda 0084');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Agenda 0084';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0084', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Agenda 0084';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0084';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('98401', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000842');
insert into ids_teste (chave, valor) select 'visita', id from public.visitas where numero_coleta = '98401';

-- ---------------------------------------------------------------------------
-- 1) Salvar
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000841", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'agenda', public.salvar_agenda(
  null, 'Agenda 0084', (select valor from ids_teste where chave = 'modelo'), null, null,
  ((now() at time zone 'America/Sao_Paulo')::date - 14),
  ((now() at time zone 'America/Sao_Paulo')::date + 7),
  'SEMANAL', 2, true, array[(select valor from ids_teste where chave = 'site')]);

select is(
  (select count(*)::int from public.agenda_sites where agenda_id = (select valor from ids_teste where chave = 'agenda')),
  1,
  'salvar_agenda grava a agenda com o site'
);

select throws_ok(
  format($$ select public.salvar_agenda(null, 'Sem Site 0084', %s, null, null, current_date, current_date,
            'DIARIO', 0, true, '{}') $$,
    (select valor from ids_teste where chave = 'modelo')),
  '22023', null,
  'agenda sem site e recusada'
);

reset role;

-- O checklist de 14 dias atras: feito pelo inspetor e levado para aquela data.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000842", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

update public.checklists_visita set criado_em = now() - interval '14 days'
 where visita_id = (select valor from ids_teste where chave = 'visita');

-- ---------------------------------------------------------------------------
-- 2) Os quatro status
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000841", "role": "authenticated"}';

select is(
  (select array_agg(status order by data_planejada)
     from public.agendamentos_do_periodo(current_date - 30, current_date + 30)
    where agenda_id = (select valor from ids_teste where chave = 'agenda')),
  array['FINALIZADO', 'ATRASADO', 'NO_PRAZO', 'AGENDADO'],
  'semanal com tolerancia de 2 dias: finalizado, atrasado, no prazo e agendado'
);

select is(
  (select count(*)::int
     from public.agendamentos_do_periodo(current_date - 1, current_date + 1)
    where agenda_id = (select valor from ids_teste where chave = 'agenda')),
  1,
  'o periodo recorta as datas planejadas'
);

-- ---------------------------------------------------------------------------
-- 3) INSPETOR
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000842", "role": "authenticated"}';

-- Desde a 0088 o campo le as agendas ("Checklists agendados" do app).
select ok(
  (select count(*) from public.agendamentos_do_periodo(current_date - 30, current_date + 30)) > 0,
  'o INSPETOR ve os agendamentos (0088)'
);

select throws_ok(
  format($$ select public.salvar_agenda(null, 'Inspetor 0084', %s, null, null, current_date, current_date,
            'DIARIO', 0, true, array[%s]::bigint[]) $$,
    (select valor from ids_teste where chave = 'modelo'), (select valor from ids_teste where chave = 'site')),
  '42501', null,
  'o INSPETOR nao cria agenda'
);

reset role;

select * from finish();
rollback;
