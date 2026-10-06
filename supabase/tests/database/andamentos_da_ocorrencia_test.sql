-- ============================================================================
-- pgTAP — analise e finalizacao das ocorrencias (migration 0064)
--
--   1) GESTOR analisa: a ocorrencia vai de AGUARDANDO a EM_ANALISE e o andamento
--      guarda o autor.
--   2) Uma segunda analise nao muda o status, e o historico tem as duas.
--   3) GESTOR finaliza: ATENDIDO, com `finalizada_em` gravada.
--   4) Ocorrencia ATENDIDA nao recebe mais nada -- 23514.
--   5) Finalizar direto, sem analise, tambem vale (AGUARDANDO -> ATENDIDO).
--   6) INSPETOR le o andamento da propria ocorrencia, mas nao registra -- 42501.
--   7) Outro INSPETOR nao ve o andamento.
--   8) Ninguem altera nem apaga andamento, nem muda o status direto -- 42501.
--   9) Anexo vai junto, amarrado ao andamento e a ocorrencia; anexo de OUTRA
--      ocorrencia e recusado.
--  10) Nem a gestao altera andamento (sem grant de UPDATE) -- 42501.
--  11) A funcao do trigger nao e executavel por `authenticated`.
--
-- Ids alheios vao para `ids_teste` (sem RLS) antes de trocar de role -- ver a
-- nota em `checklist_de_visitas_test.sql`.
-- ============================================================================

begin;

select plan(16);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000641', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'and.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000642', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'and.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000643', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'and.outro@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000641';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000642';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000643';

insert into public.grupos_sites (nome) values ('Grupo Andamento 0064');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Andamento 0064' from public.grupos_sites where nome = 'Grupo Andamento 0064';
insert into public.modelos_checklist (nome) values ('Modelo Andamento 0064');

insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Andamento 0064';
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Andamento 0064';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, o, 'Pergunta ' || o || ' 0064', 'CNA'
  from public.modelos_checklist m, generate_series(1, 3) o where m.nome = 'Modelo Andamento 0064';
insert into ids_teste (chave, valor)
  select 'p' || ordem, id from public.perguntas_checklist where texto like 'Pergunta % 0064';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('96401', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000642'),
  ('96402', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000642');
insert into ids_teste (chave, valor) select 'visita_1', id from public.visitas where numero_coleta = '96401';
insert into ids_teste (chave, valor) select 'visita_2', id from public.visitas where numero_coleta = '96402';

-- O INSPETOR envia dois checklists, cada um com uma ocorrencia (pergunta 1 "Nao").
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000642", "role": "authenticated"}';

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
  select 'oc_1', id from public.ocorrencias where checklist_id = (select valor from ids_teste where chave = 'checklist_1');
insert into ids_teste (chave, valor)
  select 'oc_2', id from public.ocorrencias where checklist_id = (select valor from ids_teste where chave = 'checklist_2');
insert into ids_teste (chave, valor) select 'tipo', id from public.tipos_de_analise where nome = 'Em Análise';
insert into ids_teste (chave, valor) select 'classif', id from public.tipos_de_classificacao where nome = 'Em Análise';

-- ---------------------------------------------------------------------------
-- Gestao analisa e finaliza
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000641", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'andamento_1', public.registrar_andamento_da_ocorrencia(
  (select valor from ids_teste where chave = 'oc_1'), 'ANALISE',
  (select valor from ids_teste where chave = 'tipo'), 'Vamos apurar o caso',
  (select valor from ids_teste where chave = 'classif'),
  'f0000000-0000-0000-0000-000000000641');

select is(
  (select status from public.ocorrencias where id = (select valor from ids_teste where chave = 'oc_1')),
  'EM_ANALISE',
  'a primeira analise leva a ocorrencia de AGUARDANDO a EM_ANALISE'
);

select is(
  (select autor_id::text from public.ocorrencia_andamentos where id = (select valor from ids_teste where chave = 'andamento_1')),
  'f0000000-0000-0000-0000-000000000641',
  'o andamento guarda o autor, que vem do banco'
);

select lives_ok(
  format($$ select public.registrar_andamento_da_ocorrencia(%L, 'ANALISE', %L, 'Segunda analise') $$,
    (select valor from ids_teste where chave = 'oc_1'), (select valor from ids_teste where chave = 'tipo')),
  'uma segunda analise e aceita'
);

select is(
  (select format('%s|%s', (select status from public.ocorrencias where id = o.valor),
                 (select count(*) from public.ocorrencia_andamentos where ocorrencia_id = o.valor))
     from ids_teste o where o.chave = 'oc_1'),
  'EM_ANALISE|2',
  'a segunda analise nao muda o status e o historico tem as duas'
);

-- Finaliza, com um anexo.
insert into ids_teste (chave, valor)
select 'andamento_fim', public.registrar_andamento_da_ocorrencia(
  (select valor from ids_teste where chave = 'oc_1'), 'FINALIZACAO',
  (select valor from ids_teste where chave = 'tipo'), 'Resolvido com o cliente',
  null, null, null, '{}', '{}', '{}',
  jsonb_build_array(jsonb_build_object(
    'storage_path', format('%s/laudo.pdf', (select valor from ids_teste where chave = 'oc_1')),
    'nome', 'laudo.pdf')));

select is(
  (select format('%s|%s', status, finalizada_em is not null) from public.ocorrencias
    where id = (select valor from ids_teste where chave = 'oc_1')),
  'ATENDIDO|true',
  'a finalizacao leva a ATENDIDO e grava finalizada_em'
);

select is(
  (select count(*)::int from public.ocorrencia_arquivos
    where andamento_id = (select valor from ids_teste where chave = 'andamento_fim')
      and ocorrencia_id = (select valor from ids_teste where chave = 'oc_1')),
  1,
  'o anexo foi gravado junto, amarrado ao andamento e a ocorrencia'
);

select throws_ok(
  format($$ select public.registrar_andamento_da_ocorrencia(%L, 'ANALISE', %L, 'Tarde demais') $$,
    (select valor from ids_teste where chave = 'oc_1'), (select valor from ids_teste where chave = 'tipo')),
  '23514', null,
  'ocorrencia ATENDIDA nao recebe mais analise'
);

select throws_ok(
  format($$ select public.registrar_andamento_da_ocorrencia(%L, 'FINALIZACAO', %L, 'De novo') $$,
    (select valor from ids_teste where chave = 'oc_1'), (select valor from ids_teste where chave = 'tipo')),
  '23514', null,
  'nao se finaliza duas vezes'
);

-- Finalizar direto, sem passar por analise.
select lives_ok(
  format($$ select public.registrar_andamento_da_ocorrencia(%L, 'FINALIZACAO', %L, 'Direto') $$,
    (select valor from ids_teste where chave = 'oc_2'), (select valor from ids_teste where chave = 'tipo')),
  'finalizar direto, sem analise, e aceito'
);

-- Anexo de OUTRA ocorrencia no andamento desta e recusado.
select throws_ok(
  format($$ insert into public.ocorrencia_arquivos (andamento_id, ocorrencia_id, storage_path, nome_original)
            values (%L, %L, %L, 'x.pdf') $$,
    (select valor from ids_teste where chave = 'andamento_fim'),
    (select valor from ids_teste where chave = 'oc_2'),
    format('%s/x.pdf', (select valor from ids_teste where chave = 'oc_2'))),
  '42501', null,
  'anexo de uma ocorrencia no andamento de outra e recusado'
);

select throws_ok(
  $$ update public.ocorrencia_andamentos set texto = 'reescrito' $$,
  '42501', null,
  'nem a gestao altera um andamento: e historico'
);

reset role;

-- ---------------------------------------------------------------------------
-- O INSPETOR da visita le, mas nao escreve
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000642", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencia_andamentos
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc_1')),
  3,
  'INSPETOR le o historico da propria ocorrencia'
);

select throws_ok(
  format($$ select public.registrar_andamento_da_ocorrencia(%L, 'ANALISE', %L, 'Inspetor tentando') $$,
    (select valor from ids_teste where chave = 'oc_2'), (select valor from ids_teste where chave = 'tipo')),
  '42501', null,
  'INSPETOR nao registra andamento -- nem em ocorrencia ja encerrada, onde o erro continua sendo de permissao e nao revela o status'
);

select throws_ok(
  $$ update public.ocorrencias set status = 'AGUARDANDO' $$,
  '42501', null,
  'ninguem muda o status direto'
);

reset role;

-- Outro INSPETOR nao ve.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000643", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencia_andamentos),
  0,
  'outro INSPETOR nao ve o andamento de visita alheia'
);

reset role;

select is(
  has_function_privilege('authenticated', 'manutencao.andamento_da_ocorrencia_muda_o_status()', 'EXECUTE'),
  false,
  'authenticated nao executa a funcao do trigger'
);

select * from finish();
rollback;
