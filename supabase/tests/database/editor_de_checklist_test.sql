-- ============================================================================
-- pgTAP — editor de checklist e grupo de perguntas (migration 0073)
--
--   1) GESTOR cadastra grupo de perguntas com cor; INSPETOR nao (42501).
--   2) GESTOR liga a pergunta a um grupo e troca o tipo de evento dela.
--   3) `tipo_resposta` continua fora do UPDATE (0061) -- 42501.
--   4) mover_pergunta troca com a vizinha; na ponta nao faz nada.
--   5) INSPETOR nao reordena (42501).
--   6) duplicar_modelo copia as perguntas, sem os grupos de sites.
--   7) O cadastro do grupo fica na auditoria.
--   8) So o GESTOR edita checklist: SUPERVISOR e OPERACIONAL, que antes da
--      0073 escreviam modelos e perguntas pela API (`pode_administrar_cadastros`),
--      agora recebem 42501 em grupo, modelo, pergunta, ligacao modelo-grupo,
--      reordenar e duplicar.
-- ============================================================================

begin;

select plan(17);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ed.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000732', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ed.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000733', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ed.supervisor@teste.local'),
  ('f0000000-0000-0000-0000-000000000734', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ed.operacional@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000731';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000732';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'f0000000-0000-0000-0000-000000000733';
update public.profiles set ativo = true, cargo = 'OPERACIONAL' where id = 'f0000000-0000-0000-0000-000000000734';

insert into public.grupos_sites (nome) values ('Grupo Editor 0073');
insert into public.modelos_checklist (nome) values ('Modelo Editor 0073');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Editor 0073';
insert into ids_teste (chave, valor) select 'grupo_site', id from public.grupos_sites where nome = 'Grupo Editor 0073';
insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
  values ((select valor from ids_teste where chave = 'modelo'), (select valor from ids_teste where chave = 'grupo_site'));

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select (select valor from ids_teste where chave = 'modelo'), o, 'Pergunta ' || o || ' 0073', 'CNA'
  from generate_series(1, 3) o;
insert into ids_teste (chave, valor) select 'p' || ordem, id from public.perguntas_checklist where texto like 'Pergunta % 0073';
insert into ids_teste (chave, valor) select 'evento', id from public.eventos order by id limit 1;

-- GESTOR ----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000731", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.grupos_perguntas (nome, cor, ordem) values ('Grupo Perguntas 0073', '#c681f8', 10) $$,
  'GESTOR cadastra grupo de perguntas com cor e ordem'
);

update public.perguntas_checklist
   set grupo_pergunta_id = (select id from public.grupos_perguntas where nome = 'Grupo Perguntas 0073'),
       evento_id = (select valor from ids_teste where chave = 'evento')
 where id = (select valor from ids_teste where chave = 'p1');

select results_eq(
  $$ select grupo_pergunta_id is not null, evento_id from public.perguntas_checklist where id = (select valor from ids_teste where chave = 'p1') $$,
  $$ values (true, (select valor from ids_teste where chave = 'evento')) $$,
  'GESTOR liga a pergunta a um grupo e troca o tipo de evento'
);

select throws_ok(
  $$ update public.perguntas_checklist set tipo_resposta = 'SN' where id = (select valor from ids_teste where chave = 'p1') $$,
  '42501', null, 'tipo_resposta segue fora do UPDATE (0061)'
);

select lives_ok(
  $$ select public.mover_pergunta((select valor from ids_teste where chave = 'p3'), true) $$,
  'mover a ultima pergunta para cima'
);

select results_eq(
  $$ select ordem from public.perguntas_checklist where texto like 'Pergunta % 0073' order by ordem $$,
  $$ values (1::smallint), (2::smallint), (3::smallint) $$,
  'a troca mantem as ordens 1, 2 e 3 sem buraco'
);

select is(
  (select ordem::int from public.perguntas_checklist where id = (select valor from ids_teste where chave = 'p3')),
  2,
  'a pergunta 3 subiu para o lugar da 2'
);

select lives_ok(
  $$ select public.mover_pergunta((select valor from ids_teste where chave = 'p1'), true) $$,
  'mover a primeira para cima nao e erro: ja esta na ponta'
);

insert into ids_teste (chave, valor)
select 'copia', public.duplicar_modelo((select valor from ids_teste where chave = 'modelo'), 'Copia Editor 0073');

select results_eq(
  $$ select (select count(*)::int from public.perguntas_checklist where modelo_id = (select valor from ids_teste where chave = 'copia')),
            (select count(*)::int from public.modelos_checklist_grupos where modelo_id = (select valor from ids_teste where chave = 'copia')) $$,
  $$ values (3, 0) $$,
  'duplicar copia as tres perguntas e nenhum grupo de sites'
);

reset role;

-- INSPETOR --------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000732", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.grupos_perguntas (nome) values ('Inspetor 0073') $$,
  '42501', null, 'INSPETOR nao cadastra grupo de perguntas'
);

select throws_ok(
  $$ select public.mover_pergunta((select valor from ids_teste where chave = 'p2'), true) $$,
  '42501', null, 'INSPETOR nao reordena perguntas'
);

reset role;

-- SUPERVISOR: so o GESTOR edita checklist (0073) ---------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000733", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.grupos_perguntas (nome) values ('Supervisor 0073') $$,
  '42501', null, 'SUPERVISOR nao cadastra grupo de perguntas'
);

select throws_ok(
  $$ insert into public.modelos_checklist (nome) values ('Modelo Supervisor 0073') $$,
  '42501', null, 'SUPERVISOR nao cadastra modelo de checklist'
);

select throws_ok(
  $$ select public.mover_pergunta((select valor from ids_teste where chave = 'p2'), true) $$,
  '42501', null, 'SUPERVISOR nao reordena perguntas'
);

reset role;

-- OPERACIONAL ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000734", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
     values ((select valor from ids_teste where chave = 'modelo'), 50, 'Pergunta operacional 0073', 'CNA') $$,
  '42501', null, 'OPERACIONAL nao cadastra pergunta'
);

select throws_ok(
  $$ insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
     values ((select valor from ids_teste where chave = 'copia'), (select valor from ids_teste where chave = 'grupo_site')) $$,
  '42501', null, 'OPERACIONAL nao liga modelo a grupo de sites'
);

select throws_ok(
  $$ select public.duplicar_modelo((select valor from ids_teste where chave = 'modelo'), 'Copia Operacional 0073') $$,
  '42501', null, 'OPERACIONAL nao duplica modelo'
);

reset role;

select ok(
  exists (select 1 from public.auditoria
           where tabela = 'grupos_perguntas' and operacao = 'INSERT'
             and dados_novos ->> 'nome' = 'Grupo Perguntas 0073'
             and ator_id = 'f0000000-0000-0000-0000-000000000731'),
  'o cadastro do grupo de perguntas fica na auditoria'
);

select * from finish();

rollback;
