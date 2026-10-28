-- ============================================================================
-- pgTAP — Historico de Checklist no banco (migration 0079)
--
-- Quatro checklists de casos conhecidos, no site "Agencia 0079", filho de
-- "Rede 0079" (o caminho do site sobe pelo superior):
--
--   C1 consultoria do inspetor A: SIM, NAO (obs "Extintor vencido"), N.A., SIM
--      e NAO numa pergunta Sim/Nao. 5/5 respondidas, 1 nao conformidade (o NAO
--      do Sim/Nao nao conta), nota 2/3 = 67.
--   C2 consultoria do inspetor A: so um SIM. 1/5, incompleto, nota 100.
--   C3 corretiva do inspetor A, motivo "Portao danificado". Concluida, sem nota.
--   C4 consultoria do inspetor B: um NAO. 1/5, nota 0.
--
--   1) A funcao e security invoker, authenticated executa e anon nao.
--   2) GESTOR ve os quatro, com o total certo.
--   3) Colunas derivadas de C1: nota, nao conformidades, respondidas/total e
--      o caminho do site.
--   4) Conclusao Finalizado: C1 e C3.
--   5) Conclusao Incompleto: C2 e C4.
--   6) Nota minima 50: C1 e C2 (a corretiva, sem nota, nao entra).
--   7) Busca livre acha pelo site pai, que so existe no caminho.
--   8) Busca livre "corretiva" acha so C3.
--   9) Busca nas respostas acha a observacao (C1) e o motivo da corretiva (C3).
--  10) Pagina: limite 1, a partir do 2o, do mais antigo -- e o total continua 4.
--  11) INSPETOR A ve so os tres dele (RLS de quem chama).
--  12) Pagina vazia alem do fim ainda informa o total.
-- ============================================================================

begin;

select plan(12);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0790000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't79.gestor@teste.local'),
  ('f0790000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't79.inspetor.a@teste.local'),
  ('f0790000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't79.inspetor.b@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0790000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0790000-0000-0000-0000-000000000002', 'f0790000-0000-0000-0000-000000000003');

insert into public.grupos_sites (nome) values ('Grupo 0079');
insert into public.sites (grupo_site_id, nome)
  select id, 'Rede 0079' from public.grupos_sites where nome = 'Grupo 0079';
insert into public.sites (grupo_site_id, nome, site_superior_id)
  select g.id, 'Agencia 0079', (select id from public.sites where nome = 'Rede 0079')
    from public.grupos_sites g where g.nome = 'Grupo 0079';
insert into ids_teste select 'site', id from public.sites where nome = 'Agencia 0079';

insert into public.modelos_checklist (nome) values ('Modelo 0079');
insert into ids_teste select 'modelo', id from public.modelos_checklist where nome = 'Modelo 0079';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select (select valor from ids_teste where chave = 'modelo'), o, 'Pergunta ' || o, case when o = 5 then 'SN' else 'CNA' end
    from generate_series(1, 5) as o;

insert into public.visitas (numero_coleta, site_id, funcionario_id, criado_em)
  select k, (select valor from ids_teste where chave = 'site'), f::uuid, now() - (d || ' hours')::interval
    from (values
      ('0079-1', 'f0790000-0000-0000-0000-000000000002', 40),
      ('0079-2', 'f0790000-0000-0000-0000-000000000002', 30),
      ('0079-3', 'f0790000-0000-0000-0000-000000000002', 20),
      ('0079-4', 'f0790000-0000-0000-0000-000000000003', 10)
    ) as v(k, f, d);

insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, modelo_id, criado_em)
  select v.id,
         case when v.numero_coleta = '0079-3' then 'CORRETIVA' else 'CONSULTORIA' end,
         case when v.numero_coleta = '0079-3' then 'Portão danificado' end,
         v.id || '/assinatura.png',
         case when v.numero_coleta = '0079-3' then null else (select valor from ids_teste where chave = 'modelo') end,
         v.criado_em + interval '5 minutes'
    from public.visitas v where v.numero_coleta like '0079-%';

insert into ids_teste
  select 'c' || right(v.numero_coleta, 1), c.id
    from public.checklists_visita c join public.visitas v on v.id = c.visita_id
   where v.numero_coleta like '0079-%';

insert into public.checklist_respostas (checklist_id, pergunta_id, resposta, observacao)
  select (select valor from ids_teste where chave = r.c), p.id, r.resposta, r.obs
    from (values
      ('c1', 1, 'SIM', null),
      ('c1', 2, 'NAO', 'Extintor vencido'),
      ('c1', 3, 'NA', null),
      ('c1', 4, 'SIM', null),
      ('c1', 5, 'NAO', null),
      ('c2', 1, 'SIM', null),
      ('c4', 1, 'NAO', null)
    ) as r(c, ordem, resposta, obs)
    join public.perguntas_checklist p
      on p.modelo_id = (select valor from ids_teste where chave = 'modelo') and p.ordem = r.ordem;

-- 1) Funcao
select ok(
  (select not p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'historico_de_checklist'),
  'historico_de_checklist e security invoker, authenticated executa e anon nao'
);

-- O filtro "so o site do teste", pronto antes de trocar de role (o stack
-- local tem outros checklists, e o temporario precisa ser criado aqui).
create temporary view so_do_teste as
  select jsonb_build_object('sites', jsonb_build_array((select valor from ids_teste where chave = 'site'))) as f;
grant select on so_do_teste to public;

-- Como o GESTOR
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0790000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- 2)
select is(
  (select (public.historico_de_checklist(f) ->> 'total')::int from so_do_teste),
  4,
  'GESTOR ve os quatro checklists do site'
);

-- 3)
select is(
  (select format('%s|%s|%s/%s|%s', l ->> 'nota', l ->> 'nao_conformidades', l ->> 'respondidas',
                 l ->> 'total_perguntas', l ->> 'caminho')
     from so_do_teste, jsonb_array_elements(public.historico_de_checklist(f) -> 'linhas') l
    where (l ->> 'id')::bigint = (select valor from ids_teste where chave = 'c1')),
  '67|1|5/5|Rede 0079 → Agencia 0079',
  'C1: nota 2/3 = 67, NAO do Sim/Nao fora das nao conformidades, 5/5 e caminho do site'
);

-- 4)
select is(
  (select (public.historico_de_checklist(f || '{"conclusao": "finalizado"}') ->> 'total')::int from so_do_teste),
  2,
  'Finalizado: C1 (5/5) e C3 (corretiva)'
);

-- 5)
select is(
  (select (public.historico_de_checklist(f || '{"conclusao": "incompleto"}') ->> 'total')::int from so_do_teste),
  2,
  'Incompleto: C2 e C4 (1/5)'
);

-- 6)
select is(
  (select (public.historico_de_checklist(f || '{"nota_minima": 50}') ->> 'total')::int from so_do_teste),
  2,
  'Nota minima 50: C1 (67) e C2 (100); a corretiva sem nota fica de fora'
);

-- 7)
select is(
  (select (public.historico_de_checklist(f || '{"busca": "rede 0079"}') ->> 'total')::int from so_do_teste),
  4,
  'Busca livre acha pelo site pai, que so aparece no caminho'
);

-- 8)
select is(
  (select (public.historico_de_checklist(f || '{"busca": "CORRETIVA"}') -> 'linhas' -> 0 ->> 'id')::bigint from so_do_teste),
  (select valor from ids_teste where chave = 'c3'),
  'Busca livre "corretiva" (sem diferenca de maiuscula) acha a corretiva'
);

-- 9)
select is(
  (select format('%s|%s',
     (public.historico_de_checklist(f || '{"busca_respostas": "extintor"}') -> 'linhas' -> 0 ->> 'id'),
     (public.historico_de_checklist(f || '{"busca_respostas": "portão"}') -> 'linhas' -> 0 ->> 'id'))
     from so_do_teste),
  format('%s|%s', (select valor from ids_teste where chave = 'c1'), (select valor from ids_teste where chave = 'c3')),
  'Busca nas respostas acha a observacao e o motivo da corretiva'
);

-- 10)
select is(
  (select format('%s|%s', r ->> 'total', r -> 'linhas' -> 0 ->> 'id')
     from so_do_teste, lateral public.historico_de_checklist(f || '{"ordem": "antigos"}', 1, 1) r),
  format('4|%s', (select valor from ids_teste where chave = 'c2')),
  'Pagina de 1 a partir do 2o, do mais antigo: C2, com o total 4'
);

-- 12)
select is(
  (select format('%s|%s', r ->> 'total', jsonb_array_length(r -> 'linhas'))
     from so_do_teste, lateral public.historico_de_checklist(f, 25, 100) r),
  '4|0',
  'Pagina alem do fim volta vazia, mas com o total'
);

-- 11) Como o INSPETOR A
set local "request.jwt.claims" to '{"sub": "f0790000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select (public.historico_de_checklist(f) ->> 'total')::int from so_do_teste),
  3,
  'INSPETOR A ve so os tres checklists dele'
);

reset role;

select * from finish();

rollback;
