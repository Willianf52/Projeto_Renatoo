-- ============================================================================
-- pgTAP — dados pessoais e "Enviar E-mail para o Superior?" (migration 0068)
--
--   1) Dados pessoais: nem a gestao le pela API; o banco recusa CPF torto.
--   2) Com "Evento" marcado, a ocorrencia aberta pelo usuario avisa o superior,
--      junto com os contatos do site.
--   3) Com "Checklist" marcado, o checklist enviado avisa o superior.
--   4) Sem as caixas, o superior nao recebe nada.
--   5) A fila do checklist so e lida e reservada pela service_role.
--   6) As caixas nao sao alteraveis por `authenticated`.
-- ============================================================================

begin;

select plan(11);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000681', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sup.chefe@teste.local'),
  ('f0000000-0000-0000-0000-000000000682', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sup.avisa@teste.local'),
  ('f0000000-0000-0000-0000-000000000683', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sup.calado@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000681';
-- O que marcou as duas caixas, e o que nao marcou nada; os dois com o mesmo superior.
update public.profiles
   set ativo = true, cargo = 'INSPETOR', superior_id = 'f0000000-0000-0000-0000-000000000681',
       email_superior_evento = true, email_superior_checklist = true
 where id = 'f0000000-0000-0000-0000-000000000682';
update public.profiles
   set ativo = true, cargo = 'INSPETOR', superior_id = 'f0000000-0000-0000-0000-000000000681'
 where id = 'f0000000-0000-0000-0000-000000000683';

insert into public.grupos_sites (nome) values ('Grupo Superior 0068');
insert into public.sites (grupo_site_id, nome, emails_eventos)
  select id, 'Site Superior 0068', array['contato.site@teste.local'] from public.grupos_sites where nome = 'Grupo Superior 0068';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Superior 0068';

insert into public.modelos_checklist (nome) values ('Modelo Superior 0068');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Superior 0068';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0068', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Superior 0068';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0068';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('96801', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000682'),
  ('96802', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000683');
insert into ids_teste (chave, valor) select 'visita_avisa', id from public.visitas where numero_coleta = '96801';
insert into ids_teste (chave, valor) select 'visita_calado', id from public.visitas where numero_coleta = '96802';

-- ---------------------------------------------------------------------------
-- 1) Dados pessoais
-- ---------------------------------------------------------------------------
insert into public.dados_pessoais_dos_usuarios (profile_id, cpf, re, celular)
values ('f0000000-0000-0000-0000-000000000682', '52998224725', 'RE-77', '11987654321');

select throws_ok(
  $$ insert into public.dados_pessoais_dos_usuarios (profile_id, cpf) values ('f0000000-0000-0000-0000-000000000683', '123.456') $$,
  '23514', null,
  'CPF fora do formato e recusado pelo banco'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000681", "role": "authenticated"}';

select throws_ok(
  $$ select cpf from public.dados_pessoais_dos_usuarios $$,
  '42501', null,
  'nem o GESTOR le os dados pessoais pela API'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email_superior_evento', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'email_superior_checklist', 'UPDATE')
  and has_column_privilege('authenticated', 'public.profiles', 'email_superior_checklist', 'SELECT'),
  'as caixas sao lidas, mas nao alteradas, por authenticated'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2) a 4) Os dois inspetores enviam um checklist com um "Nao conforme"
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000682", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'checklist_avisa', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_avisa'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_avisa')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000683", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'checklist_calado', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_calado'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_calado')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

select is(
  (select string_agg(e.destinatario, ',' order by e.destinatario)
     from public.ocorrencia_emails e
     join public.ocorrencias o on o.id = e.ocorrencia_id
    where o.checklist_id = (select valor from ids_teste where chave = 'checklist_avisa')
      and e.motivo = 'ABERTURA'),
  'contato.site@teste.local,sup.chefe@teste.local',
  'com "Evento" marcado, a abertura avisa o superior e o contato do site'
);

select is(
  (select string_agg(e.destinatario, ',')
     from public.ocorrencia_emails e
     join public.ocorrencias o on o.id = e.ocorrencia_id
    where o.checklist_id = (select valor from ids_teste where chave = 'checklist_calado')
      and e.motivo = 'ABERTURA'),
  'contato.site@teste.local',
  'sem a caixa, so o contato do site'
);

select is(
  (select string_agg(destinatario, ',') from public.checklist_emails
    where checklist_id = (select valor from ids_teste where chave = 'checklist_avisa')),
  'sup.chefe@teste.local',
  'com "Checklist" marcado, o checklist enviado avisa o superior'
);

select is(
  (select count(*)::int from public.checklist_emails
    where checklist_id = (select valor from ids_teste where chave = 'checklist_calado')),
  0,
  'sem a caixa, o checklist nao avisa ninguem'
);

-- ---------------------------------------------------------------------------
-- 5) A fila do checklist
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000681", "role": "authenticated"}';

select throws_ok(
  $$ select destinatario from public.checklist_emails $$,
  '42501', null,
  'authenticated nao le a fila do checklist'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.reservar_emails_de_checklist(integer, text[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'manutencao.email_do_checklist_ao_superior()', 'EXECUTE'),
  'so a service_role reserva a fila; a funcao do trigger fica fora do alcance'
);

select is(
  (select count(*)::int from public.reservar_emails_de_checklist(10, array['sup.chefe@teste.local'])),
  1,
  'a reserva entrega o e-mail pendente'
);

select is(
  (select status from public.checklist_emails
    where checklist_id = (select valor from ids_teste where chave = 'checklist_avisa')),
  'ENVIANDO',
  'e o marca como ENVIANDO, para nao sair duas vezes'
);

select * from finish();
rollback;
