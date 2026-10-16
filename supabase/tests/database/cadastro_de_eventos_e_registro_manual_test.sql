-- ============================================================================
-- pgTAP — Cadastro de Eventos e Registrar Evento (migration 0072)
--
--   1) GESTOR salva evento com sites e e-mails, numa chamada so.
--   2) Subtipo so de um nivel: neto e recusado (23514).
--   3) SUPERVISOR nao salva evento (42501) nem le os e-mails do evento.
--   4) GESTOR registra ocorrencia manual: origem MANUAL, numero na sequencia.
--   5) Evento restrito a outro site, subtipo de outro evento: 23514.
--   6) Bloqueio de repeticao: a segunda no intervalo e recusada (P0001).
--   7) SUPERVISOR nao registra (42501), mas le a ocorrencia; INSPETOR alheio
--      nao le.
--   8) A abertura enfileira o e-mail do evento.
--   9) Os relatorios de Eventos contam a manual, com quem abriu como usuario.
--  10) Arquivo da abertura: o autor anexa sem andamento; outro nao.
--  11) O cadastro fica na auditoria.
-- ============================================================================

begin;

select plan(17);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ev.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ev.supervisor@teste.local'),
  ('f0000000-0000-0000-0000-000000000723', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ev.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000721';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'f0000000-0000-0000-0000-000000000722';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000723';

insert into public.grupos_sites (nome) values ('Grupo Eventos 0072');
insert into public.sites (grupo_site_id, nome)
  select id, s from public.grupos_sites, unnest(array['Site A 0072', 'Site B 0072']) s where nome = 'Grupo Eventos 0072';
insert into ids_teste (chave, valor) select 'site_a', id from public.sites where nome = 'Site A 0072';
insert into ids_teste (chave, valor) select 'site_b', id from public.sites where nome = 'Site B 0072';

-- GESTOR ----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000721", "role": "authenticated"}';

insert into ids_teste (chave, valor)
select 'pai', public.salvar_evento(
  null, 'Pai 0072', 'Descricao', null, 120, null, true,
  array[(select valor from ids_teste where chave = 'site_a')], array['aviso.0072@teste.local']);
insert into ids_teste (chave, valor)
select 'filho', public.salvar_evento(
  null, 'Filho 0072', null, (select valor from ids_teste where chave = 'pai'), null, null, true, '{}', '{}');
insert into ids_teste (chave, valor)
select 'bloqueado', public.salvar_evento(null, 'Bloqueado 0072', null, null, null, 60, true, '{}', '{}');

select results_eq(
  $$ select e.nome, e.tempo_atendimento_minutos, n.emails, array(select es.site_id from public.eventos_sites es where es.evento_id = e.id)
       from public.eventos e join public.eventos_notificacoes n on n.evento_id = e.id
      where e.nome = 'Pai 0072' $$,
  $$ select 'Pai 0072'::text, 120, array['aviso.0072@teste.local'], array[(select valor from ids_teste where chave = 'site_a')] $$,
  'GESTOR salva evento com sites e e-mails numa chamada'
);

select throws_ok(
  $$ select public.salvar_evento(null, 'Neto 0072', null, (select valor from ids_teste where chave = 'filho'), null, null, true, '{}', '{}') $$,
  '23514', null, 'subtipo tem um nivel so: neto e recusado'
);

insert into ids_teste (chave, valor)
select 'manual', public.registrar_ocorrencia_manual(
  (select valor from ids_teste where chave = 'site_a'),
  (select valor from ids_teste where chave = 'pai'),
  (select valor from ids_teste where chave = 'filho'),
  null, 'Registrada a mao');

select results_eq(
  $$ select origem, subevento_id, status, aberta_por::text, visita_id is null
       from public.ocorrencias where id = (select valor from ids_teste where chave = 'manual') $$,
  $$ select 'MANUAL'::text, (select valor from ids_teste where chave = 'filho'), 'AGUARDANDO'::text,
            'f0000000-0000-0000-0000-000000000721'::text, true $$,
  'GESTOR registra ocorrencia manual, sem visita'
);

select throws_ok(
  $$ select public.registrar_ocorrencia_manual((select valor from ids_teste where chave = 'site_b'), (select valor from ids_teste where chave = 'pai')) $$,
  '23514', null, 'evento restrito ao site A nao abre no site B'
);

select throws_ok(
  $$ select public.registrar_ocorrencia_manual(
       (select valor from ids_teste where chave = 'site_a'), (select valor from ids_teste where chave = 'bloqueado'),
       (select valor from ids_teste where chave = 'filho')) $$,
  '23514', null, 'subtipo de outro evento e recusado'
);

select lives_ok(
  $$ select public.registrar_ocorrencia_manual((select valor from ids_teste where chave = 'site_a'), (select valor from ids_teste where chave = 'bloqueado')) $$,
  'primeira ocorrencia do evento com bloqueio abre'
);

select throws_ok(
  $$ select public.registrar_ocorrencia_manual((select valor from ids_teste where chave = 'site_a'), (select valor from ids_teste where chave = 'bloqueado')) $$,
  'P0001', null, 'a segunda dentro do bloqueio de repeticao e recusada'
);

select lives_ok(
  $$ insert into public.ocorrencia_arquivos (ocorrencia_id, storage_path, nome_original)
     values ((select valor from ids_teste where chave = 'manual'),
             (select valor from ids_teste where chave = 'manual') || '/abc-foto.jpg', 'foto.jpg') $$,
  'o autor anexa arquivo a abertura, sem andamento'
);

select is(
  (select count(*)::integer from public.ocorrencias_de_evento(now() - interval '1 day', now() + interval '1 day', false,
     jsonb_build_object('funcionario', 'f0000000-0000-0000-0000-000000000721', 'evento', (select valor from ids_teste where chave = 'pai')))),
  1,
  'relatorios de Eventos contam a manual, com quem abriu como usuario'
);

reset role;

-- SUPERVISOR ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000722", "role": "authenticated"}';

select throws_ok(
  $$ select public.salvar_evento(null, 'Supervisor 0072', null, null, null, null, true, '{}', '{}') $$,
  '42501', null, 'SUPERVISOR nao salva evento'
);

select is(
  (select count(*)::integer from public.eventos_notificacoes),
  0,
  'SUPERVISOR nao le os e-mails dos eventos'
);

select throws_ok(
  $$ select public.registrar_ocorrencia_manual((select valor from ids_teste where chave = 'site_a'), (select valor from ids_teste where chave = 'pai')) $$,
  '42501', null, 'SUPERVISOR nao registra evento'
);

select is(
  (select count(*)::integer from public.ocorrencias where id = (select valor from ids_teste where chave = 'manual')),
  1,
  'SUPERVISOR le a ocorrencia manual (gestao inteira)'
);

select throws_ok(
  $$ insert into public.ocorrencia_arquivos (ocorrencia_id, storage_path, nome_original)
     values ((select valor from ids_teste where chave = 'manual'),
             (select valor from ids_teste where chave = 'manual') || '/outro.jpg', 'outro.jpg') $$,
  '42501', null, 'quem nao abriu nao anexa a abertura'
);

reset role;

-- INSPETOR alheio ---------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000723", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.ocorrencias where id = (select valor from ids_teste where chave = 'manual')),
  0,
  'INSPETOR que nao abriu nao ve a ocorrencia manual'
);

reset role;

select ok(
  exists (select 1 from public.ocorrencia_emails
           where ocorrencia_id = (select valor from ids_teste where chave = 'manual')
             and motivo = 'ABERTURA' and destinatario = 'aviso.0072@teste.local'),
  'a abertura enfileira o e-mail do evento'
);

select ok(
  exists (select 1 from public.auditoria
           where tabela = 'eventos' and operacao = 'INSERT'
             and dados_novos ->> 'nome' = 'Pai 0072'
             and ator_id = 'f0000000-0000-0000-0000-000000000721'),
  'o cadastro do evento fica na auditoria com o GESTOR'
);

select * from finish();

rollback;
