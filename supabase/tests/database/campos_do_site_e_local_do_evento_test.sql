-- ============================================================================
-- pgTAP -- campos do site, lingua e local do evento (migration 0082)
--
--   1) O site recusa e-mail invalido em "E-mails Checklist" (23514) e tipo de
--      intervencao fora da lista (23514); a lingua so aceita PT ou ES.
--   2) Com a trava do aviso de inspecao aberta, o checklist enfileira os
--      "E-mails Checklist" do site; a ocorrencia aberta por ele avisa as
--      pessoas de "Notificacoes Eventos" (so as ativas).
--   3) Com a trava restrita, o e-mail do site que nao esta na lista fica de
--      fora.
--   4) O Registrar Evento grava o "Local do evento".
-- ============================================================================

begin;

select plan(8);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'campos.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'campos.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000823', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'campos.avisado@teste.local'),
  ('f0000000-0000-0000-0000-000000000824', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'campos.inativo@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000821';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000822';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000823';
update public.profiles set ativo = false, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000824';

insert into public.grupos_sites (nome) values ('Grupo Campos 0082');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Campos 0082' from public.grupos_sites where nome = 'Grupo Campos 0082';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Campos 0082';

insert into public.modelos_checklist (nome) values ('Modelo Campos 0082');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Campos 0082';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0082', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Campos 0082';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0082';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('98201', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000822'),
  ('98202', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000822');
insert into ids_teste (chave, valor) select 'v1', id from public.visitas where numero_coleta = '98201';
insert into ids_teste (chave, valor) select 'v2', id from public.visitas where numero_coleta = '98202';

-- ---------------------------------------------------------------------------
-- 1) Validacoes
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ update public.sites set emails_checklist = array['sem-arroba'] where id = %s $$,
    (select valor from ids_teste where chave = 'site')),
  '23514', null,
  'o site recusa e-mail invalido em E-mails Checklist'
);

select throws_ok(
  format($$ update public.sites set tipo_intervencao = 'DRONE' where id = %s $$,
    (select valor from ids_teste where chave = 'site')),
  '23514', null,
  'o site recusa tipo de intervencao fora da lista'
);

select throws_ok(
  $$ update public.profiles set lingua = 'EN' where id = 'f0000000-0000-0000-0000-000000000823' $$,
  '23514', null,
  'a lingua so aceita PT ou ES'
);

-- ---------------------------------------------------------------------------
-- 2) Trava aberta: e-mails do site e pessoas avisadas
-- ---------------------------------------------------------------------------
update public.sites
   set emails_checklist = array['Contato.Checklist@Site.test'],
       notificar_eventos = array['f0000000-0000-0000-0000-000000000823', 'f0000000-0000-0000-0000-000000000824']::uuid[]
 where id = (select valor from ids_teste where chave = 'site');

update manutencao.aviso_de_inspecao set somente_para = null;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000822", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v1'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v1')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

select ok(
  exists (
    select 1 from public.checklist_emails ce
      join public.checklists_visita c on c.id = ce.checklist_id
     where c.visita_id = (select valor from ids_teste where chave = 'v1')
       and ce.destinatario = 'contato.checklist@site.test'
  ),
  'com a trava aberta, o checklist avisa os E-mails Checklist do site (em minusculas)'
);

select is(
  (select array_agg(e.destinatario order by e.destinatario)
     from public.ocorrencia_emails e
     join public.ocorrencias o on o.id = e.ocorrencia_id
    where o.visita_id = (select valor from ids_teste where chave = 'v1')
      and e.motivo = 'ABERTURA'
      and e.destinatario like 'campos.%'),
  array['campos.avisado@teste.local'],
  'a abertura avisa as pessoas de Notificacoes Eventos, so as ativas'
);

-- ---------------------------------------------------------------------------
-- 3) Trava restrita: o e-mail do site fora da lista nao entra
-- ---------------------------------------------------------------------------
update manutencao.aviso_de_inspecao set somente_para = array['outra.pessoa@teste.local'];

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000822", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'v2'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'v2')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

select ok(
  not exists (
    select 1 from public.checklist_emails ce
      join public.checklists_visita c on c.id = ce.checklist_id
     where c.visita_id = (select valor from ids_teste where chave = 'v2')
       and ce.destinatario = 'contato.checklist@site.test'
  ),
  'com a trava restrita, o e-mail do site fora da lista fica de fora'
);

-- ---------------------------------------------------------------------------
-- 4) Local do evento
-- ---------------------------------------------------------------------------
insert into public.eventos (nome) values ('Evento Campos 0082');
insert into ids_teste (chave, valor) select 'evento', id from public.eventos where nome = 'Evento Campos 0082';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000821", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'manual', public.registrar_ocorrencia_manual(
  (select valor from ids_teste where chave = 'site'),
  (select valor from ids_teste where chave = 'evento'),
  null, null, 'Observacao 0082', '  Portaria   lateral  ');

reset role;

select is(
  (select local_descricao from public.ocorrencias where id = (select valor from ids_teste where chave = 'manual')),
  'Portaria   lateral',
  'o Registrar Evento grava o Local do evento, sem os espacos das pontas'
);

select is(
  (select lingua from public.profiles where id = 'f0000000-0000-0000-0000-000000000823'),
  'PT',
  'a lingua nasce PT'
);

select * from finish();
rollback;
