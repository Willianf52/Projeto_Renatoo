-- ============================================================================
-- pgTAP -- "Enviar Evento" por e-mail (migration 0081)
--
--   1) O gestor envia para duas pessoas: dois ENVIO na fila, com o remetente,
--      sem repetir endereco e ignorando quem esta inativo.
--   2) O inspetor (nao ve toda a operacao) e recusado (42501).
--   3) Lista vazia, mais de 20 e so destinatarios inativos sao recusados.
--   4) Evento que nao existe e recusado.
--   5) A sessao continua sem escrever direto na fila (42501).
-- ============================================================================

begin;

select plan(8);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'envio.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'envio.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000813', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Envio.Destino@Teste.local'),
  ('f0000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'envio.inativo@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000811';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000812';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000813';
update public.profiles set ativo = false, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000814';

insert into public.grupos_sites (nome) values ('Grupo Envio 0081');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Envio 0081' from public.grupos_sites where nome = 'Grupo Envio 0081';
insert into public.modelos_checklist (nome) values ('Modelo Envio 0081');

insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Envio 0081';
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Envio 0081';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0081', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Envio 0081';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0081';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('98101', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000812');
insert into ids_teste (chave, valor) select 'visita', id from public.visitas where numero_coleta = '98101';

-- O inspetor responde "Nao conforme": abre a ocorrencia (0063).
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000812", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

insert into ids_teste (chave, valor)
  select 'oc', id from public.ocorrencias where visita_id = (select valor from ids_teste where chave = 'visita');

-- ---------------------------------------------------------------------------
-- 1) O gestor envia
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000811", "role": "authenticated"}';

select is(
  public.enviar_ocorrencia_por_email(
    (select valor from ids_teste where chave = 'oc'),
    array[
      'f0000000-0000-0000-0000-000000000812',
      'f0000000-0000-0000-0000-000000000813',
      'f0000000-0000-0000-0000-000000000813',
      'f0000000-0000-0000-0000-000000000814'
    ]::uuid[]),
  2,
  'o gestor enfileira o evento para as duas pessoas ativas, sem repetir'
);

reset role;

select is(
  (select array_agg(format('%s|%s|%s', motivo, destinatario, enviado_por) order by destinatario)
     from public.ocorrencia_emails
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc') and motivo = 'ENVIO'),
  array[
    'ENVIO|envio.destino@teste.local|f0000000-0000-0000-0000-000000000811',
    'ENVIO|envio.inspetor@teste.local|f0000000-0000-0000-0000-000000000811'
  ],
  'na fila: motivo ENVIO, e-mail em minusculas e o remetente'
);

-- ---------------------------------------------------------------------------
-- 2) O inspetor nao envia
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000812", "role": "authenticated"}';

select throws_ok(
  format($$ select public.enviar_ocorrencia_por_email(%s, array['f0000000-0000-0000-0000-000000000813']::uuid[]) $$,
    (select valor from ids_teste where chave = 'oc')),
  '42501', null,
  'quem nao ve toda a operacao nao envia o evento'
);

-- ---------------------------------------------------------------------------
-- 3) e 4) Destinatarios invalidos e evento inexistente
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000811", "role": "authenticated"}';

select throws_ok(
  format($$ select public.enviar_ocorrencia_por_email(%s, array[]::uuid[]) $$,
    (select valor from ids_teste where chave = 'oc')),
  '22023', null,
  'sem destinatario, recusa'
);

select throws_ok(
  format($$ select public.enviar_ocorrencia_por_email(%s, (select array_agg(gen_random_uuid()) from generate_series(1, 21))) $$,
    (select valor from ids_teste where chave = 'oc')),
  '22023', null,
  'mais de 20 destinatarios, recusa'
);

select throws_ok(
  format($$ select public.enviar_ocorrencia_por_email(%s, array['f0000000-0000-0000-0000-000000000814']::uuid[]) $$,
    (select valor from ids_teste where chave = 'oc')),
  '22023', null,
  'so destinatario inativo, recusa'
);

select throws_ok(
  $$ select public.enviar_ocorrencia_por_email(-1, array['f0000000-0000-0000-0000-000000000813']::uuid[]) $$,
  'P0002', null,
  'evento que nao existe, recusa'
);

-- ---------------------------------------------------------------------------
-- 5) A fila continua fechada para a sessao
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario) values (%s, 'ENVIO', 'x@y.test') $$,
    (select valor from ids_teste where chave = 'oc')),
  '42501', null,
  'a sessao nao escreve direto na fila'
);

reset role;

select * from finish();
rollback;
