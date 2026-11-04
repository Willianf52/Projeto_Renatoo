-- ============================================================================
-- pgTAP -- Portal igual ao antigo (migration 0089)
--
--   - troca de status pelo Quadro: andamento com `status_novo` aplica o status;
--     status de encerramento novo (Concluido) fecha e nao recebe mais nada;
--   - aprovacao: checklist de modelo que exige nasce aguardando; reprovar sem
--     motivo e recusado; aprovar grava quem e quando; o inspetor nao aprova;
--   - permissoes do evento: o gestor grava, o inspetor nao.
-- ============================================================================

begin;

select plan(9);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000891', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pga.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000892', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pga.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000891';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000892';

insert into public.grupos_sites (nome) values ('Grupo Portal 0089');
insert into public.sites (grupo_site_id, nome) select id, 'Site Portal 0089' from public.grupos_sites where nome = 'Grupo Portal 0089';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Portal 0089';
insert into ids_teste (chave, valor) select 'grupo_site', id from public.grupos_sites where nome = 'Grupo Portal 0089';

insert into public.eventos (nome) values ('Evento Portal 0089');
insert into ids_teste (chave, valor) select 'evento', id from public.eventos where nome = 'Evento Portal 0089';
insert into public.tipos_de_analise (nome) values ('Analise 0089');
insert into ids_teste (chave, valor) select 'tipo_analise', id from public.tipos_de_analise where nome = 'Analise 0089';

insert into public.ocorrencias (numero, ano, site_id, evento_id, origem, aberta_por)
values
  (98901, 2026, (select valor from ids_teste where chave = 'site'), (select valor from ids_teste where chave = 'evento'), 'MANUAL', 'f0000000-0000-0000-0000-000000000891'),
  (98902, 2026, (select valor from ids_teste where chave = 'site'), (select valor from ids_teste where chave = 'evento'), 'MANUAL', 'f0000000-0000-0000-0000-000000000891');
insert into ids_teste (chave, valor) select 'oc_1', id from public.ocorrencias where numero = 98901 and ano = 2026;
insert into ids_teste (chave, valor) select 'oc_2', id from public.ocorrencias where numero = 98902 and ano = 2026;

insert into public.modelos_checklist (nome, exige_aprovacao) values ('Modelo Portal 0089', true);
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Portal 0089';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0089', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Portal 0089';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0089';
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('98901', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000892');
insert into ids_teste (chave, valor) select 'visita', id from public.visitas where numero_coleta = '98901';

-- O inspetor envia o checklist do modelo que exige aprovacao.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000892", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;
insert into ids_teste (chave, valor)
  select 'checklist', id from public.checklists_visita where visita_id = (select valor from ids_teste where chave = 'visita');

select is(
  (select aprovacao from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist')),
  'AGUARDANDO',
  'checklist de modelo que exige aprovacao nasce aguardando'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000892", "role": "authenticated"}';

select throws_ok(
  format('select public.decidir_aprovacao_do_checklist(%s, %L)', (select valor from ids_teste where chave = 'checklist'), 'APROVADO'),
  '42501',
  null,
  'o inspetor nao aprova'
);

select throws_ok(
  format(
    $$ insert into public.evento_permissoes (evento_id, canal, grupo_site_id) values (%s, 'WEB', %s) $$,
    (select valor from ids_teste where chave = 'evento'), (select valor from ids_teste where chave = 'grupo_site')),
  '42501',
  null,
  'o inspetor nao grava permissao de evento'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000891", "role": "authenticated"}';

select throws_ok(
  format('select public.decidir_aprovacao_do_checklist(%s, %L, %L)', (select valor from ids_teste where chave = 'checklist'), 'REPROVADO', ' '),
  '22023',
  null,
  'reprovar exige motivo'
);

select lives_ok(
  format('select public.decidir_aprovacao_do_checklist(%s, %L)', (select valor from ids_teste where chave = 'checklist'), 'APROVADO'),
  'o gestor aprova'
);

select lives_ok(
  format(
    $$ insert into public.evento_permissoes (evento_id, canal, grupo_site_id) values (%s, 'WEB', %s) $$,
    (select valor from ids_teste where chave = 'evento'), (select valor from ids_teste where chave = 'grupo_site')),
  'o gestor grava permissao de evento'
);

-- Quadro: arrastar para Panico e depois para Concluido.
insert into public.ocorrencia_andamentos (ocorrencia_id, tipo, tipo_analise_id, texto, status_novo)
values ((select valor from ids_teste where chave = 'oc_1'), 'ANALISE', (select valor from ids_teste where chave = 'tipo_analise'),
        'Status alterado no Quadro para Pânico.', 'PANICO');

insert into public.ocorrencia_andamentos (ocorrencia_id, tipo, tipo_analise_id, texto, status_novo)
values ((select valor from ids_teste where chave = 'oc_2'), 'FINALIZACAO', (select valor from ids_teste where chave = 'tipo_analise'),
        'Status alterado no Quadro para Concluído.', 'CONCLUIDO');

select is(
  (select status from public.ocorrencias where id = (select valor from ids_teste where chave = 'oc_1')),
  'PANICO',
  'arrastar no Quadro aplica o status escolhido'
);

select throws_ok(
  format(
    $$ insert into public.ocorrencia_andamentos (ocorrencia_id, tipo, tipo_analise_id, texto) values (%s, 'ANALISE', %s, 'depois') $$,
    (select valor from ids_teste where chave = 'oc_2'), (select valor from ids_teste where chave = 'tipo_analise')),
  '23514',
  null,
  'concluido e encerramento: nao recebe mais andamento'
);

reset role;

select ok(
  (select aprovacao = 'APROVADO' and aprovacao_por = 'f0000000-0000-0000-0000-000000000891' and aprovacao_em is not null
     from public.checklists_visita where id = (select valor from ids_teste where chave = 'checklist')),
  'aprovacao grava quem e quando'
);

select * from finish();
rollback;
