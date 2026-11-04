-- ============================================================================
-- pgTAP -- App de campo igual ao antigo (migration 0088)
--
--   - o INSPETOR le as agendas e os agendamentos do periodo;
--   - "Abandonar Inspecao": apaga a propria visita sem checklist; recusa a de
--     outro inspetor e a que ja tem checklist;
--   - leitura aceita latitude/longitude e recusa coordenada fora da faixa.
-- ============================================================================

begin;

select plan(7);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000881', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acg.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000882', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acg.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000883', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'acg.outro@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000881';
update public.profiles set ativo = true, cargo = 'INSPETOR'
 where id in ('f0000000-0000-0000-0000-000000000882', 'f0000000-0000-0000-0000-000000000883');

insert into public.grupos_sites (nome) values ('Grupo App 0088');
insert into public.sites (grupo_site_id, nome) select id, 'Site App 0088' from public.grupos_sites where nome = 'Grupo App 0088';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site App 0088';

insert into public.modelos_checklist (nome) values ('Modelo App 0088');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo App 0088';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0088', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo App 0088';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0088';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('98801', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000882'),
  ('98802', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000883'),
  ('98803', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000882');
insert into ids_teste (chave, valor) select 'v_minha', id from public.visitas where numero_coleta = '98801';
insert into ids_teste (chave, valor) select 'v_outro', id from public.visitas where numero_coleta = '98802';
insert into ids_teste (chave, valor) select 'v_com_checklist', id from public.visitas where numero_coleta = '98803';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000881", "role": "authenticated"}';

select public.salvar_agenda(
  null, 'Agenda App 0088', (select valor from ids_teste where chave = 'modelo'), null, null,
  ((now() at time zone 'America/Sao_Paulo')::date),
  ((now() at time zone 'America/Sao_Paulo')::date + 7),
  'DIARIO', 0, true, array[(select valor from ids_teste where chave = 'site')]);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000882", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v_com_checklist'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v_com_checklist')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));

select is(
  (select count(*)::int from public.agendas where nome = 'Agenda App 0088'),
  1,
  'o inspetor le a agenda'
);

select ok(
  (select count(*) from public.agendamentos_do_periodo(
     (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + 7)
    where agenda = 'Agenda App 0088') = 8,
  'o inspetor ve os oito agendamentos diarios da semana'
);

select lives_ok(
  format('select public.abandonar_visita(%s)', (select valor from ids_teste where chave = 'v_minha')),
  'abandona a propria visita sem checklist'
);

select throws_ok(
  format('select public.abandonar_visita(%s)', (select valor from ids_teste where chave = 'v_outro')),
  'P0002',
  null,
  'nao abandona a visita de outro inspetor'
);

select throws_ok(
  format('select public.abandonar_visita(%s)', (select valor from ids_teste where chave = 'v_com_checklist')),
  '42501',
  null,
  'nao abandona visita com checklist enviado'
);

reset role;

select is(
  (select array_agg(numero_coleta order by numero_coleta) from public.visitas where numero_coleta in ('98801', '98802', '98803')),
  array['98802', '98803']::text[],
  'so a visita abandonada sumiu'
);

select throws_ok(
  format(
    'insert into public.leituras (visita_id, data_hora, latitude, longitude) values (%s, now(), 95, 10)',
    (select valor from ids_teste where chave = 'v_outro')),
  '23514',
  null,
  'latitude fora da faixa e recusada'
);

select * from finish();
rollback;
