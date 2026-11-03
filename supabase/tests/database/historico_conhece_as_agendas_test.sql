-- ============================================================================
-- pgTAP -- Historico de Checklist com as agendas (migration 0087)
--
-- Uma agenda SEMANAL de 14 dias atras ate 7 dias a frente, tolerancia de 2
-- dias, no site A. Tres checklists do mesmo modelo:
--   - no site A, feito 13 dias atras (data planejada 14 dias atras) -> Agenda,
--     No prazo;
--   - no site A, feito 3 dias atras (data planejada 7 dias atras)  -> Agenda,
--     Atrasado;
--   - no site B, sem agenda -> Avulso, No prazo.
-- E os filtros de Origem e Situacao.
-- ============================================================================

begin;

select plan(5);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000871', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hag.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000872', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hag.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000871';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000872';

insert into public.grupos_sites (nome) values ('Grupo Hist 0087');
insert into public.sites (grupo_site_id, nome)
  select id, s from public.grupos_sites, unnest(array['Site A 0087', 'Site B 0087']) s where nome = 'Grupo Hist 0087';
insert into ids_teste (chave, valor) select 'site_a', id from public.sites where nome = 'Site A 0087';
insert into ids_teste (chave, valor) select 'site_b', id from public.sites where nome = 'Site B 0087';

insert into public.modelos_checklist (nome) values ('Modelo Hist 0087');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Hist 0087';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0087', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Hist 0087';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0087';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('98701', (select valor from ids_teste where chave = 'site_a'), 'f0000000-0000-0000-0000-000000000872'),
  ('98702', (select valor from ids_teste where chave = 'site_a'), 'f0000000-0000-0000-0000-000000000872'),
  ('98703', (select valor from ids_teste where chave = 'site_b'), 'f0000000-0000-0000-0000-000000000872');
insert into ids_teste (chave, valor) select 'v_prazo', id from public.visitas where numero_coleta = '98701';
insert into ids_teste (chave, valor) select 'v_atraso', id from public.visitas where numero_coleta = '98702';
insert into ids_teste (chave, valor) select 'v_avulso', id from public.visitas where numero_coleta = '98703';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000871", "role": "authenticated"}';

select public.salvar_agenda(
  null, 'Agenda Hist 0087', (select valor from ids_teste where chave = 'modelo'), null, null,
  ((now() at time zone 'America/Sao_Paulo')::date - 14),
  ((now() at time zone 'America/Sao_Paulo')::date + 7),
  'SEMANAL', 2, true, array[(select valor from ids_teste where chave = 'site_a')]);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000872", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = v), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = v)),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'))
  from unnest(array['v_prazo', 'v_atraso', 'v_avulso']) as v;

reset role;

update public.checklists_visita set criado_em = now() - interval '13 days'
 where visita_id = (select valor from ids_teste where chave = 'v_prazo');
update public.checklists_visita set criado_em = now() - interval '3 days'
 where visita_id = (select valor from ids_teste where chave = 'v_atraso');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000871", "role": "authenticated"}';

create temporary table linhas_0087 as
select l
  from jsonb_array_elements(public.historico_de_checklist(
         jsonb_build_object('modelos', jsonb_build_array((select valor from ids_teste where chave = 'modelo')::text)))
       -> 'linhas') as l;

select is(
  (select format('%s|%s|%s', l ->> 'agenda_nome', l ->> 'situacao', l ->> 'data_planejada')
     from linhas_0087 where (l ->> 'site_id')::bigint = (select valor from ids_teste where chave = 'site_a')
       and (l ->> 'criado_em')::timestamptz < now() - interval '10 days'),
  format('Agenda Hist 0087|no_prazo|%s', (now() at time zone 'America/Sao_Paulo')::date - 14),
  'checklist dentro da tolerancia: agenda, no prazo e a data planejada'
);

select is(
  (select l ->> 'situacao' from linhas_0087
    where (l ->> 'site_id')::bigint = (select valor from ids_teste where chave = 'site_a')
      and (l ->> 'criado_em')::timestamptz > now() - interval '10 days'),
  'atrasado',
  'checklist depois da tolerancia: atrasado'
);

select is(
  (select format('%s|%s', coalesce(l ->> 'agenda_nome', '(sem)'), l ->> 'situacao') from linhas_0087
    where (l ->> 'site_id')::bigint = (select valor from ids_teste where chave = 'site_b')),
  '(sem)|no_prazo',
  'checklist sem agenda: avulso, no prazo'
);

select is(
  (public.historico_de_checklist(jsonb_build_object(
     'modelos', jsonb_build_array((select valor from ids_teste where chave = 'modelo')::text),
     'origem', 'agenda')) ->> 'total')::int,
  2,
  'filtro Origem Agenda: so os dois da agenda'
);

select is(
  (public.historico_de_checklist(jsonb_build_object(
     'modelos', jsonb_build_array((select valor from ids_teste where chave = 'modelo')::text),
     'situacao', 'atrasado')) ->> 'total')::int,
  1,
  'filtro Situacao Atrasado: so o atrasado'
);

reset role;

select * from finish();
rollback;
