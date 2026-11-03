-- ============================================================================
-- pgTAP — aviso de inspecao aos gestores (migration 0080)
--
-- Dois gestores ativos (A e B), um gestor inativo (C) e um inspetor sem
-- superior. O inspetor envia um checklist a cada passo, mudando a trava.
--
--   1) Trava vazia (como a migration deixa): nenhum gestor recebe.
--   2) Trava com o e-mail de A: so A recebe.
--   3) Trava nula: A e B recebem; C, inativo, nao.
--   4) A trava nao e lida por `authenticated`.
-- ============================================================================

begin;

select plan(4);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g80.a@teste.local'),
  ('f0000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g80.b@teste.local'),
  ('f0000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g80.c@teste.local'),
  ('f0000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'i80@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
 where id in ('f0000000-0000-0000-0000-000000000801', 'f0000000-0000-0000-0000-000000000802');
update public.profiles set ativo = false, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000803';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000804';

insert into public.grupos_sites (nome) values ('Grupo 0080');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0080' from public.grupos_sites where nome = 'Grupo 0080';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site 0080';

insert into public.modelos_checklist (nome) values ('Modelo 0080');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo 0080';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select (select valor from ids_teste where chave = 'modelo'), 1, 'Pergunta 0080', 'CNA';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 0080';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select k, (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000804'
    from unnest(array['98001', '98002', '98003']) as k;
insert into ids_teste (chave, valor) select 'v' || right(numero_coleta, 1), id from public.visitas where numero_coleta like '9800_';

-- Os destinatarios de teste (os do resto do banco local ficam de fora). Chamada
-- sempre depois do `reset role`: o schema temporario e de quem abriu a sessao.
create function pg_temp.avisados(c text) returns text language sql as $$
  select coalesce(string_agg(destinatario, ',' order by destinatario), '')
    from public.checklist_emails
   where checklist_id = (select valor from ids_teste where chave = c)
     and destinatario like 'g80.%';
$$;

-- 1) Trava vazia
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000804", "role": "authenticated"}';
insert into ids_teste (chave, valor) select 'c1', public.registrar_checklist(
  (select valor from ids_teste where chave = 'v1'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v1')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;

select is(pg_temp.avisados('c1'), '', 'com a trava vazia, nenhum gestor recebe');

-- 2) So o gestor A
update manutencao.aviso_de_inspecao set somente_para = array['g80.a@teste.local'];
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000804", "role": "authenticated"}';
insert into ids_teste (chave, valor) select 'c2', public.registrar_checklist(
  (select valor from ids_teste where chave = 'v2'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v2')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;

select is(pg_temp.avisados('c2'), 'g80.a@teste.local', 'com a trava num e-mail, so esse gestor recebe');

-- 3) Todos os gestores ativos
update manutencao.aviso_de_inspecao set somente_para = null;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000804", "role": "authenticated"}';
insert into ids_teste (chave, valor) select 'c3', public.registrar_checklist(
  (select valor from ids_teste where chave = 'v3'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v3')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));
reset role;

select is(
  pg_temp.avisados('c3'),
  'g80.a@teste.local,g80.b@teste.local',
  'com a trava nula, todos os gestores ativos recebem e o inativo nao'
);

-- 4) A trava nao aparece para quem usa o app
set local role authenticated;
select throws_ok(
  $$ select somente_para from manutencao.aviso_de_inspecao $$,
  '42501', null,
  'authenticated nao le a trava'
);
reset role;

select * from finish();

rollback;
