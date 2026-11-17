-- ============================================================================
-- pgTAP -- o PDF do checklist vai tambem a quem fez a inspecao (migration 0102)
--
--   1) Com a trava aberta, o checklist enfileira o e-mail de quem o enviou
--      (um inspetor, que nao e gestor nem superior de ninguem).
--   2) Com a trava restrita a outra pessoa, o autor fica de fora.
--   3) Um gestor que faz o proprio checklist recebe uma vez so.
-- ============================================================================

begin;

select plan(3);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pdf.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Pdf.Inspetor@Teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001021';
update public.profiles set ativo = true, cargo = 'INSPETOR', email_superior_checklist = false
 where id = 'f0000000-0000-0000-0000-000000001022';

insert into public.grupos_sites (nome) values ('Grupo PDF 0102');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site PDF 0102' from public.grupos_sites where nome = 'Grupo PDF 0102';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site PDF 0102';

insert into public.modelos_checklist (nome) values ('Modelo PDF 0102');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo PDF 0102';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0102', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo PDF 0102';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0102';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('910201', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001022'),
  ('910202', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001022'),
  ('910203', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001021');
insert into ids_teste (chave, valor) select 'v' || right(numero_coleta, 1), id from public.visitas where numero_coleta like '91020_';

create function pg_temp.destinatarios(p_visita text) returns text[] language sql as $f$
  select coalesce(array_agg(ce.destinatario order by ce.destinatario), '{}')
    from public.checklist_emails ce
    join public.checklists_visita c on c.id = ce.checklist_id
   where c.visita_id = (select valor from ids_teste where chave = p_visita)
     and ce.destinatario like 'pdf.%';
$f$;

-- 1) Trava aberta: o inspetor recebe
update manutencao.aviso_de_inspecao set somente_para = null;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001022", "role": "authenticated"}';
select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v1'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v1')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;
select ok(
  'pdf.inspetor@teste.local' = any (pg_temp.destinatarios('v1')),
  'com a trava aberta, quem fez a inspecao recebe o PDF (em minusculas)'
);

-- 2) Trava restrita a outra pessoa: o inspetor fica de fora
update manutencao.aviso_de_inspecao set somente_para = array['outra.pessoa@teste.local'];
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001022", "role": "authenticated"}';
select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v2'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v2')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;
select is(
  pg_temp.destinatarios('v2'),
  '{}'::text[],
  'com a trava restrita, o autor fora da lista nao recebe'
);

-- 3) Gestor que faz o proprio checklist: uma linha so
update manutencao.aviso_de_inspecao set somente_para = null;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001021", "role": "authenticated"}';
select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v3'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v3')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;
select is(
  pg_temp.destinatarios('v3'),
  array['pdf.gestor@teste.local'],
  'o gestor que faz o proprio checklist recebe uma vez so'
);

select * from finish();
rollback;
