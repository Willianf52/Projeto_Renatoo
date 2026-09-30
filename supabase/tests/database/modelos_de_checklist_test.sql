-- ============================================================================
-- pgTAP — modelos de checklist por grupo de sites (migration 0061)
--
--   1) Existe um modelo PADRAO, e so um.
--   2) GESTOR cadastra modelo, liga a um grupo e cadastra pergunta Sim/Nao
--      nele -- sucesso.
--   3) GESTOR nao move pergunta para outro modelo (sem grant de UPDATE na
--      coluna) -- nega com 42501.
--   4) GESTOR nao desliga o modelo PADRAO -- check.
--   5) DELETE de modelo recusado por falta de grant -- 42501.
--   6) Pergunta cadastrada sem modelo cai no PADRAO (a tela atual do painel).
--   7) INSPETOR le os modelos e a ligacao com o grupo -- o app precisa.
--   8) INSPETOR nao cadastra modelo -- 42501.
--   9) INSPETOR nao liga modelo a grupo -- 42501.
--  10) `registrar_checklist` com modelo grava o modelo e a foto da pergunta.
--  11) `registrar_checklist` na chamada antiga (6 argumentos, APK 1.1.0) cai
--      no PADRAO.
--  12) Resposta de pergunta de OUTRO modelo e recusada -- 23514.
--  13) "Nao se aplica" em pergunta Sim/Nao e recusado -- 23514.
--  14) Foto de pergunta de OUTRO modelo e recusada -- 23514.
--  15) CORRETIVA com modelo e recusada pelo check -- 23514.
--  16) `sincronizar_grupos_do_modelo` troca os grupos de uma vez, e
--      repeticao na lista nao estoura a PK.
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
  ('f0000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mod.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'f0000000-0000-0000-0000-000000000611';
update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0000000-0000-0000-0000-000000000612';

insert into public.grupos_sites (nome) values ('Grupo Modelo 0061');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Modelo 0061' from public.grupos_sites where nome = 'Grupo Modelo 0061';

insert into ids_teste (chave, valor) select 'grupo', id from public.grupos_sites where nome = 'Grupo Modelo 0061';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Modelo 0061';
insert into ids_teste (chave, valor) select 'padrao', id from public.modelos_checklist where padrao;

-- Pergunta do PADRAO, para os asserts de "outro modelo".
insert into public.perguntas_checklist (ordem, texto) values (9611, 'Pergunta do padrao 0061');
insert into ids_teste (chave, valor)
  select 'pergunta_padrao', id from public.perguntas_checklist where texto = 'Pergunta do padrao 0061';

-- ---------------------------------------------------------------------------
-- 1) Um padrao, e so um.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.modelos_checklist where padrao and ativo),
  1,
  'existe exatamente um modelo padrao, ativo'
);

-- ---------------------------------------------------------------------------
-- 2-6) A gestao.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000611", "role": "authenticated"}';

insert into public.modelos_checklist (nome) values ('Modelo 0061');

insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
  select m.id, (select valor from ids_teste where chave = 'grupo')
  from public.modelos_checklist m where m.nome = 'Modelo 0061';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Duvidas com o RH?', 'SN'
  from public.modelos_checklist m where m.nome = 'Modelo 0061';

select is(
  (select format('%s/%s',
     (select count(*) from public.modelos_checklist_grupos g
        join public.modelos_checklist m on m.id = g.modelo_id
       where m.nome = 'Modelo 0061'),
     (select p.tipo_resposta from public.perguntas_checklist p
        join public.modelos_checklist m on m.id = p.modelo_id
       where m.nome = 'Modelo 0061'))),
  '1/SN',
  'GESTOR cadastra modelo, liga ao grupo e cadastra pergunta Sim/Nao nele'
);

select throws_ok(
  format(
    $$ update public.perguntas_checklist set modelo_id = %L where texto = 'Duvidas com o RH?' $$,
    (select valor from ids_teste where chave = 'padrao')
  ),
  '42501',
  null,
  'GESTOR nao move pergunta para outro modelo -- modelo_id fora do grant de UPDATE'
);

select throws_ok(
  $$ update public.modelos_checklist set ativo = false where padrao $$,
  '23514',
  null,
  'GESTOR nao desliga o modelo padrao'
);

select throws_ok(
  $$ delete from public.modelos_checklist where nome = 'Modelo 0061' $$,
  '42501',
  null,
  'DELETE de modelo e recusado por falta de grant -- despublicar e ativo = false'
);

insert into public.perguntas_checklist (ordem, texto) values (9612, 'Pergunta sem modelo 0061');

-- Para o assert 16: um segundo grupo, e a troca para ele (com repeticao).
reset role;
insert into public.grupos_sites (nome) values ('Grupo Modelo 0061 B');
insert into ids_teste (chave, valor) select 'grupo_b', id from public.grupos_sites where nome = 'Grupo Modelo 0061 B';
insert into public.modelos_checklist (nome) values ('Modelo 0061 B');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000611", "role": "authenticated"}';

select public.sincronizar_grupos_do_modelo(
  (select id from public.modelos_checklist where nome = 'Modelo 0061 B'),
  array[(select valor from ids_teste where chave = 'grupo'),
        (select valor from ids_teste where chave = 'grupo_b'),
        (select valor from ids_teste where chave = 'grupo_b')]
);
select public.sincronizar_grupos_do_modelo(
  (select id from public.modelos_checklist where nome = 'Modelo 0061 B'),
  array[(select valor from ids_teste where chave = 'grupo_b'),
        (select valor from ids_teste where chave = 'grupo_b')]
);

select is(
  (select modelo_id from public.perguntas_checklist where texto = 'Pergunta sem modelo 0061'),
  (select valor from ids_teste where chave = 'padrao'),
  'pergunta cadastrada sem modelo cai no padrao'
);

reset role;

insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo 0061';
insert into ids_teste (chave, valor)
  select 'pergunta_modelo', id from public.perguntas_checklist where texto = 'Duvidas com o RH?';

-- ---------------------------------------------------------------------------
-- 7-9) O INSPETOR le, mas nao escreve.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000612", "role": "authenticated"}';

select is(
  (select count(*)::int
     from public.modelos_checklist_grupos g
     join public.modelos_checklist m on m.id = g.modelo_id
    where g.grupo_site_id = (select valor from ids_teste where chave = 'grupo')),
  1,
  'INSPETOR le os modelos ligados ao grupo do site'
);

select throws_ok(
  $$ insert into public.modelos_checklist (nome) values ('Nao deveria entrar') $$,
  '42501',
  null,
  'INSPETOR nao cadastra modelo'
);

select throws_ok(
  format(
    $$ insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id) values (%L, %L) $$,
    (select valor from ids_teste where chave = 'padrao'),
    (select valor from ids_teste where chave = 'grupo')
  ),
  '42501',
  null,
  'INSPETOR nao liga modelo a grupo'
);

-- ---------------------------------------------------------------------------
-- 10) RPC com modelo e foto por pergunta.
-- ---------------------------------------------------------------------------
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('96101', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000612');
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('96102', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000612');
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('96103', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000612');

insert into ids_teste (chave, valor) select 'visita_nova', id from public.visitas where numero_coleta = '96101';
insert into ids_teste (chave, valor) select 'visita_antiga', id from public.visitas where numero_coleta = '96102';
insert into ids_teste (chave, valor) select 'visita_corretiva', id from public.visitas where numero_coleta = '96103';

-- Statement proprio, e nao subconsulta do assert -- ver a nota no cabecalho de
-- `checklist_de_visitas_test.sql` sobre o snapshot.
insert into ids_teste (chave, valor)
select 'checklist_novo', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_nova'),
  'CONSULTORIA',
  '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_nova')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object(
    'pergunta_id', (select valor from ids_teste where chave = 'pergunta_modelo'),
    'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'),
  jsonb_build_array(jsonb_build_object(
    'pergunta_id', (select valor from ids_teste where chave = 'pergunta_modelo'),
    'storage_path', format('%s/foto-rh.jpg', (select valor from ids_teste where chave = 'visita_nova'))))
);

select is(
  (select format('%s/%s',
     (select c.modelo_id = (select valor from ids_teste where chave = 'modelo')
        from public.checklists_visita c where c.id = r.valor),
     (select count(*) from public.checklist_fotos f
       where f.checklist_id = r.valor
         and f.pergunta_id = (select valor from ids_teste where chave = 'pergunta_modelo')))
   from ids_teste r where r.chave = 'checklist_novo'),
  't/1',
  'registrar_checklist grava o modelo e a foto da pergunta'
);

-- ---------------------------------------------------------------------------
-- 11) A chamada antiga, de seis argumentos, cai no PADRAO.
-- ---------------------------------------------------------------------------
insert into ids_teste (chave, valor)
select 'checklist_antigo', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_antiga'),
  'CONSULTORIA',
  '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_antiga')),
  array[format('%s/foto.jpg', (select valor from ids_teste where chave = 'visita_antiga'))],
  jsonb_build_array(jsonb_build_object(
    'pergunta_id', (select valor from ids_teste where chave = 'pergunta_padrao'),
    'resposta', 'NA'))
);

select is(
  (select c.modelo_id from public.checklists_visita c
    where c.id = (select valor from ids_teste where chave = 'checklist_antigo')),
  (select valor from ids_teste where chave = 'padrao'),
  'registrar_checklist sem modelo (APK 1.1.0) grava no padrao'
);

-- ---------------------------------------------------------------------------
-- 12-14) Coerencia com o modelo respondido.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklist_respostas (checklist_id, pergunta_id, resposta) values (%L, %L, 'SIM') $$,
    (select valor from ids_teste where chave = 'checklist_novo'),
    (select valor from ids_teste where chave = 'pergunta_padrao')
  ),
  '23514',
  null,
  'resposta de pergunta de outro modelo e recusada'
);

-- Numa visita nova, para a PK (checklist, pergunta) nao responder antes.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('96104', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000612');

select throws_ok(
  format(
    $$ select public.registrar_checklist(v.id, 'CONSULTORIA', '', v.id || '/a.png', array[]::text[],
         jsonb_build_array(jsonb_build_object('pergunta_id', %1$L::bigint, 'resposta', 'NA')),
         %2$L::bigint)
       from public.visitas v where v.numero_coleta = '96104' $$,
    (select valor from ids_teste where chave = 'pergunta_modelo'),
    (select valor from ids_teste where chave = 'modelo')
  ),
  '23514',
  null,
  '"Nao se aplica" em pergunta Sim/Nao e recusado'
);

select throws_ok(
  format(
    $$ insert into public.checklist_fotos (checklist_id, storage_path, pergunta_id) values (%1$L, '%2$s/outra.jpg', %3$L) $$,
    (select valor from ids_teste where chave = 'checklist_novo'),
    (select valor from ids_teste where chave = 'visita_nova'),
    (select valor from ids_teste where chave = 'pergunta_padrao')
  ),
  '23514',
  null,
  'foto de pergunta de outro modelo e recusada'
);

-- ---------------------------------------------------------------------------
-- 15) CORRETIVA nao tem modelo.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, modelo_id)
       values (%1$L, 'CORRETIVA', 'portao quebrado', '%1$s/a.png', %2$L) $$,
    (select valor from ids_teste where chave = 'visita_corretiva'),
    (select valor from ids_teste where chave = 'modelo')
  ),
  '23514',
  null,
  'CORRETIVA com modelo e recusada pelo check'
);

reset role;

-- ---------------------------------------------------------------------------
-- 16) Sincronizacao dos grupos.
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(g.grupo_site_id::text, ',')
     from public.modelos_checklist_grupos g
     join public.modelos_checklist m on m.id = g.modelo_id
    where m.nome = 'Modelo 0061 B'),
  (select valor::text from ids_teste where chave = 'grupo_b'),
  'sincronizar_grupos_do_modelo troca os grupos e ignora repeticao'
);

select * from finish();

rollback;
