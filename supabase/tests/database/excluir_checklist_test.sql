-- ============================================================================
-- pgTAP — excluir checklist (migration 0066)
--
--   1) SUPERVISOR e INSPETOR nao excluem: o DELETE nao alcanca a linha.
--   2) GESTOR exclui: checklist, respostas e a ocorrencia em AGUARDANDO saem;
--      a visita fica; a auditoria guarda quem excluiu.
--   3) Ocorrencia ja analisada segura o checklist -- 23514, e nada sai.
--   4) A funcao do trigger nao e executavel por `authenticated`.
--
-- Ids alheios vao para `ids_teste` (sem RLS) antes de trocar de role -- ver a
-- nota em `checklist_de_visitas_test.sql`.
-- ============================================================================

begin;

select plan(10);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000661', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'exc.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000662', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'exc.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000663', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'exc.supervisor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000661';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000662';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'f0000000-0000-0000-0000-000000000663';

insert into public.grupos_sites (nome) values ('Grupo Exclusao 0066');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Exclusao 0066' from public.grupos_sites where nome = 'Grupo Exclusao 0066';
insert into public.modelos_checklist (nome) values ('Modelo Exclusao 0066');

insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Exclusao 0066';
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Exclusao 0066';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0066', 'CNA'
  from public.modelos_checklist m where m.nome = 'Modelo Exclusao 0066';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0066';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('96601', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000662'),
  ('96602', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000662');
insert into ids_teste (chave, valor) select 'visita_1', id from public.visitas where numero_coleta = '96601';
insert into ids_teste (chave, valor) select 'visita_2', id from public.visitas where numero_coleta = '96602';

-- O INSPETOR envia dois checklists, cada um com uma ocorrencia ("Nao conforme").
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000662", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'checklist_1', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_1'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_1')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));
insert into ids_teste (chave, valor)
select 'checklist_2', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_2'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_2')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

insert into ids_teste (chave, valor)
  select 'oc_2', id from public.ocorrencias where checklist_id = (select valor from ids_teste where chave = 'checklist_2');

-- ---------------------------------------------------------------------------
-- SUPERVISOR e INSPETOR nao excluem
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000663", "role": "authenticated"}';

delete from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist_1');

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000662", "role": "authenticated"}';

delete from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist_1');

reset role;

select is(
  (select count(*)::int from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist_1')),
  1,
  'SUPERVISOR e INSPETOR nao alcancam a linha: o checklist continua'
);

-- ---------------------------------------------------------------------------
-- A segunda ocorrencia recebe uma analise: o checklist dela fica preso
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000661", "role": "authenticated"}';

select public.registrar_andamento_da_ocorrencia(
  (select valor from ids_teste where chave = 'oc_2'), 'ANALISE',
  (select id from public.tipos_de_analise where nome = 'Em Análise'), 'Apurando');

select throws_ok(
  format($$ delete from public.checklists_visita where id = %L $$,
    (select valor from ids_teste where chave = 'checklist_2')),
  '23514', null,
  'checklist com ocorrencia ja analisada nao e excluido'
);

select is(
  (select count(*)::int from public.ocorrencia_andamentos where ocorrencia_id = (select valor from ids_teste where chave = 'oc_2')),
  1,
  'a analise continua la'
);

-- ---------------------------------------------------------------------------
-- GESTOR exclui o primeiro
-- ---------------------------------------------------------------------------
-- DELETE com RETURNING so vale em CTE no topo, nao dentro do `is()`.
with excluidos as (
  delete from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist_1')
  returning id
)
select is((select count(*)::int from excluidos), 1, 'GESTOR exclui o checklist');

reset role;

select is(
  (select count(*)::int from public.checklist_respostas where checklist_id = (select valor from ids_teste where chave = 'checklist_1')),
  0,
  'as respostas saem junto'
);

select is(
  (select count(*)::int from public.ocorrencias where checklist_id = (select valor from ids_teste where chave = 'checklist_1')),
  0,
  'a ocorrencia em AGUARDANDO sai junto'
);

select is(
  (select count(*)::int from public.visitas where id = (select valor from ids_teste where chave = 'visita_1')),
  1,
  'a visita fica: e da coleta, nao do checklist'
);

select is(
  (select format('%s|%s', ator_id, dados_antigos ->> 'visita_id') from public.auditoria
    where tabela = 'checklists_visita' and operacao = 'DELETE'
      and registro_id = (select valor from ids_teste where chave = 'checklist_1')::text),
  format('f0000000-0000-0000-0000-000000000661|%s', (select valor from ids_teste where chave = 'visita_1')),
  'a auditoria guarda quem excluiu e a linha inteira'
);

select is(
  has_function_privilege('authenticated', 'manutencao.checklist_com_ocorrencia_tratada_fica()', 'EXECUTE'),
  false,
  'authenticated nao executa a funcao do trigger'
);

select ok(
  not has_table_privilege('authenticated', 'public.checklist_respostas', 'DELETE')
  and not has_table_privilege('authenticated', 'public.checklist_fotos', 'DELETE'),
  'o DELETE aberto e so o do checklist: respostas e fotos saem pela cascata'
);

select * from finish();
rollback;
