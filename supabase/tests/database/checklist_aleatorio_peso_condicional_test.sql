-- ============================================================================
-- pgTAP -- ordem aleatoria, peso e pergunta condicional (migration 0108)
--
-- Modelo A: P1 (CNA, peso 3), P2 (CNA), P3 (CNA), P4 (CN). Modelo B: Q1.
--
--   1) Pergunta nova nasce com peso 1 e modelo sem ordem aleatoria.
--   2) Peso fora de 1 a 10 e recusado.
--   3) GESTOR grava peso, ordem aleatoria e condicional (grants por coluna).
--   4) Base de outro modelo, cadeia de condicionais, base que vira condicional
--      e "Nao se aplica" de base sem N.A. sao recusados.
--   5) duplicar_modelo leva peso, ordem aleatoria e a condicional apontando
--      para a copia da base.
--   6) A nota do Historico e ponderada: P1 SIM (peso 3) e P2 NAO (peso 1) da
--      3/4 = 75 (sem peso seria 50).
-- ============================================================================

begin;

select plan(11);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cond.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cond.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001081';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001082';

insert into public.modelos_checklist (nome) values ('Modelo A 0108'), ('Modelo B 0108');
insert into ids_teste select 'a', id from public.modelos_checklist where nome = 'Modelo A 0108';
insert into ids_teste select 'b', id from public.modelos_checklist where nome = 'Modelo B 0108';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select (select valor from ids_teste where chave = 'a'), o, 'P' || o || ' 0108', case when o = 4 then 'CN' else 'CNA' end
    from generate_series(1, 4) as o;
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select valor, 1, 'Q1 0108', 'CNA' from ids_teste where chave = 'b';
insert into ids_teste select 'p' || ordem, id from public.perguntas_checklist
  where modelo_id = (select valor from ids_teste where chave = 'a');
insert into ids_teste select 'q1', id from public.perguntas_checklist where texto = 'Q1 0108';

-- 1)
select ok(
  (select bool_and(peso = 1) from public.perguntas_checklist where modelo_id = (select valor from ids_teste where chave = 'a'))
  and not (select ordem_aleatoria from public.modelos_checklist where id = (select valor from ids_teste where chave = 'a')),
  'pergunta nova nasce com peso 1 e modelo sem ordem aleatoria'
);

-- 2)
select throws_ok(
  $$ update public.perguntas_checklist set peso = 11 where id = (select valor from ids_teste where chave = 'p2') $$,
  '23514', null, 'peso acima de 10 e recusado'
);

-- 3) GESTOR ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001081", "role": "authenticated"}';

select lives_ok(
  $$ update public.perguntas_checklist set peso = 3 where id = (select valor from ids_teste where chave = 'p1');
     update public.modelos_checklist set ordem_aleatoria = true where id = (select valor from ids_teste where chave = 'a');
     update public.perguntas_checklist
        set pergunta_base_id = (select valor from ids_teste where chave = 'p1'), resposta_gatilho = 'NAO'
      where id = (select valor from ids_teste where chave = 'p3') $$,
  'GESTOR grava peso, ordem aleatoria e a condicional P3 <- P1 = Nao conforme'
);

-- 4)
select throws_ok(
  $$ update public.perguntas_checklist
        set pergunta_base_id = (select valor from ids_teste where chave = 'q1'), resposta_gatilho = 'SIM'
      where id = (select valor from ids_teste where chave = 'p2') $$,
  '23514', null, 'base de outro modelo e recusada'
);

select throws_ok(
  $$ update public.perguntas_checklist
        set pergunta_base_id = (select valor from ids_teste where chave = 'p3'), resposta_gatilho = 'SIM'
      where id = (select valor from ids_teste where chave = 'p2') $$,
  '23514', null, 'base condicional (cadeia) e recusada'
);

select throws_ok(
  $$ update public.perguntas_checklist
        set pergunta_base_id = (select valor from ids_teste where chave = 'p2'), resposta_gatilho = 'SIM'
      where id = (select valor from ids_teste where chave = 'p1') $$,
  '23514', null, 'pergunta que ja e base nao vira condicional'
);

select throws_ok(
  $$ update public.perguntas_checklist
        set pergunta_base_id = (select valor from ids_teste where chave = 'p4'), resposta_gatilho = 'NA'
      where id = (select valor from ids_teste where chave = 'p2') $$,
  '23514', null, '"Nao se aplica" de base Conforme/Nao conforme e recusado'
);

-- INSPETOR le, mas nao grava ----------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001082", "role": "authenticated"}';

select is(
  (select format('%s|%s', peso, resposta_gatilho) from public.perguntas_checklist
    where id = (select valor from ids_teste where chave = 'p3')),
  '1|NAO',
  'INSPETOR le o peso e a condicional (o app precisa deles)'
);

reset role;

-- 5)
insert into ids_teste
  select 'copia', public.duplicar_modelo((select valor from ids_teste where chave = 'a'), 'Copia 0108');

select is(
  (select format('%s|%s|%s|%s',
            m.ordem_aleatoria,
            (select peso from public.perguntas_checklist where modelo_id = m.id and ordem = 1),
            (select b.ordem from public.perguntas_checklist c
               join public.perguntas_checklist b on b.id = c.pergunta_base_id
              where c.modelo_id = m.id and c.ordem = 3 and b.modelo_id = m.id),
            (select resposta_gatilho from public.perguntas_checklist where modelo_id = m.id and ordem = 3))
     from public.modelos_checklist m where m.id = (select valor from ids_teste where chave = 'copia')),
  'true|3|1|NAO',
  'duplicar leva a ordem aleatoria, o peso e a condicional apontando para a copia da base'
);

-- 6) Nota ponderada no Historico ---------------------------------------------
insert into public.grupos_sites (nome) values ('Grupo 0108');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0108' from public.grupos_sites where nome = 'Grupo 0108';
insert into ids_teste select 'site', id from public.sites where nome = 'Site 0108';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('0108-1', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001082');
insert into public.checklists_visita (visita_id, tipo, assinatura_path, modelo_id)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png', (select valor from ids_teste where chave = 'a')
    from public.visitas v where v.numero_coleta = '0108-1';
insert into ids_teste
  select 'c1', c.id from public.checklists_visita c join public.visitas v on v.id = c.visita_id where v.numero_coleta = '0108-1';
insert into public.checklist_respostas (checklist_id, pergunta_id, resposta)
  values
    ((select valor from ids_teste where chave = 'c1'), (select valor from ids_teste where chave = 'p1'), 'SIM'),
    ((select valor from ids_teste where chave = 'c1'), (select valor from ids_teste where chave = 'p2'), 'NAO');

create temporary view so_do_teste as
  select jsonb_build_object('sites', jsonb_build_array((select valor from ids_teste where chave = 'site'))) as f;
grant select on so_do_teste to public;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001081", "role": "authenticated"}';

select is(
  (select l ->> 'nota'
     from so_do_teste, jsonb_array_elements(public.historico_de_checklist(f) -> 'linhas') l
    where (l ->> 'id')::bigint = (select valor from ids_teste where chave = 'c1')),
  '75',
  'nota ponderada: Conforme de peso 3 e Nao conforme de peso 1 da 75'
);

select is(
  (select (public.historico_de_checklist(f || '{"nota_minima": 70}') ->> 'total')::int from so_do_teste),
  1,
  'o filtro de nota minima usa a nota ponderada'
);

reset role;

select * from finish();
rollback;
