-- ============================================================================
-- pgTAP — e-mails das ocorrencias (migration 0065)
--
--   1) O site recusa e-mail invalido nos contatos (23514).
--   2) A abertura enfileira os contatos do site, sem repetidos (maiusculas nao
--      contam), e site sem contato nao enfileira nada.
--   3) A analise enfileira responsavel, apoio e e-mails externos.
--   4) A finalizacao enfileira "avisar", externos e os contatos do site.
--   5) Quem ve a ocorrencia ve os e-mails dela; outro inspetor nao ve.
--   6) Ninguem da sessao escreve na fila nem reserva lote (42501 / catalogo).
--   7) `reservar_emails_de_ocorrencia`: entrega o lote como ENVIANDO, nao
--      repete na chamada seguinte, respeita `p_somente` e descarta o que
--      esperou mais de 3 dias.
--   8) Com segredos no Vault, um comando que enfileirou chama o portal UMA vez,
--      na URL derivada da do aviso de troca de senha; sem segredos, abrir a
--      ocorrencia nao falha.
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
  ('f0000000-0000-0000-0000-000000000651', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'email.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000652', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'email.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000653', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'email.outro@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000651';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000652';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000653';

insert into public.grupos_sites (nome) values ('Grupo Emails 0065');
insert into public.sites (grupo_site_id, nome, emails_eventos)
  select id, 'Site Com Contato 0065', array['Contato@Site.test', 'contato@site.test', 'gerente@site.test']
    from public.grupos_sites where nome = 'Grupo Emails 0065';
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Sem Contato 0065' from public.grupos_sites where nome = 'Grupo Emails 0065';
insert into public.modelos_checklist (nome) values ('Modelo Emails 0065');

insert into ids_teste (chave, valor) select 'site_com', id from public.sites where nome = 'Site Com Contato 0065';
insert into ids_teste (chave, valor) select 'site_sem', id from public.sites where nome = 'Site Sem Contato 0065';
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Emails 0065';

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0065', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Emails 0065';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0065';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('96501', (select valor from ids_teste where chave = 'site_com'), 'f0000000-0000-0000-0000-000000000652'),
  ('96502', (select valor from ids_teste where chave = 'site_sem'), 'f0000000-0000-0000-0000-000000000652');
insert into ids_teste (chave, valor) select 'visita_com', id from public.visitas where numero_coleta = '96501';
insert into ids_teste (chave, valor) select 'visita_sem', id from public.visitas where numero_coleta = '96502';

-- ---------------------------------------------------------------------------
-- 1) Contato invalido
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ update public.sites set emails_eventos = array['sem-arroba'] where id = %s $$,
    (select valor from ids_teste where chave = 'site_com')),
  '23514', null,
  'o site recusa e-mail invalido nos contatos'
);

-- ---------------------------------------------------------------------------
-- 2) Abertura -- sem segredos no Vault, de proposito: abrir nao pode falhar.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000652", "role": "authenticated"}';

select lives_ok(
  format($$ select public.registrar_checklist(%s, 'CONSULTORIA', '', %L, array[]::text[], %L::jsonb, %s) $$,
    (select valor from ids_teste where chave = 'visita_com'),
    format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_com')),
    jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
    (select valor from ids_teste where chave = 'modelo')),
  'o inspetor envia o checklist com "Nao conforme" mesmo sem o Vault configurado'
);

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_sem'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_sem')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'NAO')),
  (select valor from ids_teste where chave = 'modelo'));

reset role;

insert into ids_teste (chave, valor)
  select 'oc_com', id from public.ocorrencias where visita_id = (select valor from ids_teste where chave = 'visita_com');
insert into ids_teste (chave, valor)
  select 'oc_sem', id from public.ocorrencias where visita_id = (select valor from ids_teste where chave = 'visita_sem');
insert into ids_teste (chave, valor) select 'tipo', id from public.tipos_de_analise where nome = 'Em Análise';

select is(
  (select array_agg(format('%s|%s', motivo, destinatario) order by destinatario)
     from public.ocorrencia_emails where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com')),
  array['ABERTURA|contato@site.test', 'ABERTURA|gerente@site.test'],
  'a abertura enfileira os contatos do site uma vez cada, em minusculas'
);

select is(
  (select count(*)::int from public.ocorrencia_emails where ocorrencia_id = (select valor from ids_teste where chave = 'oc_sem')),
  0,
  'site sem contato nao enfileira nada na abertura'
);

-- ---------------------------------------------------------------------------
-- 3) e 4) Analise e finalizacao
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000651", "role": "authenticated"}';

select public.registrar_andamento_da_ocorrencia(
  (select valor from ids_teste where chave = 'oc_com'), 'ANALISE',
  (select valor from ids_teste where chave = 'tipo'), 'Apurando',
  null, 'f0000000-0000-0000-0000-000000000651', null,
  array['f0000000-0000-0000-0000-000000000652']::uuid[], '{}',
  array['Externo@Fora.test', 'email.gestor@teste.local']);

select public.registrar_andamento_da_ocorrencia(
  (select valor from ids_teste where chave = 'oc_com'), 'FINALIZACAO',
  (select valor from ids_teste where chave = 'tipo'), 'Resolvido',
  null, null, null, '{}', array['f0000000-0000-0000-0000-000000000653']::uuid[], array['fim@fora.test']);

reset role;

select is(
  (select array_agg(destinatario order by destinatario) from public.ocorrencia_emails
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com') and motivo = 'ANALISE'),
  array['email.gestor@teste.local', 'email.inspetor@teste.local', 'externo@fora.test'],
  'a analise avisa responsavel, apoio e externos, sem repetir o responsavel digitado como externo'
);

select is(
  (select array_agg(destinatario order by destinatario) from public.ocorrencia_emails
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com') and motivo = 'FINALIZACAO'),
  array['contato@site.test', 'email.outro@teste.local', 'fim@fora.test', 'gerente@site.test'],
  'a finalizacao avisa os marcados, os externos e os contatos do site'
);

select ok(
  (select bool_and(andamento_id is not null) from public.ocorrencia_emails
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com') and motivo <> 'ABERTURA'),
  'o e-mail de andamento aponta o andamento que o gerou'
);

-- ---------------------------------------------------------------------------
-- 5) Leitura
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000652", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencia_emails where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com')),
  9,
  'o inspetor da visita ve os e-mails da ocorrencia'
);

-- ---------------------------------------------------------------------------
-- 6) Escrita fechada
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario) values (%s, 'ABERTURA', 'forjado@fora.test') $$,
    (select valor from ids_teste where chave = 'oc_com')),
  '42501', null,
  'ninguem da sessao escreve na fila de e-mails'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000653", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencia_emails where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com')),
  0,
  'outro inspetor nao ve os e-mails'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.reservar_emails_de_ocorrencia(integer, text[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reservar_emails_de_ocorrencia(integer, text[])', 'EXECUTE')
    and has_function_privilege('service_role', 'public.reservar_emails_de_ocorrencia(integer, text[])', 'EXECUTE'),
  'so o service_role reserva lote de e-mails'
);

select ok(
  not has_function_privilege('authenticated', 'manutencao.emails_da_abertura_da_ocorrencia()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'manutencao.emails_do_andamento_da_ocorrencia()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'manutencao.avisar_portal_dos_emails_de_ocorrencia()', 'EXECUTE'),
  'as funcoes dos triggers nao sao executaveis por authenticated'
);

-- ---------------------------------------------------------------------------
-- 7) Reserva de lote
-- ---------------------------------------------------------------------------
-- Isola a fila desta transacao: outras linhas PENDENTE no stack nao entram.
update public.ocorrencia_emails set status = 'ENVIADO'
 where status = 'PENDENTE' and ocorrencia_id <> (select valor from ids_teste where chave = 'oc_com');

-- Uma linha velha, para o descarte.
update public.ocorrencia_emails set criado_em = now() - interval '4 days'
 where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com') and destinatario = 'fim@fora.test';

set local role service_role;

select is(
  (select array_agg(destinatario order by destinatario)
     from public.reservar_emails_de_ocorrencia(50, array['contato@site.test'])),
  array['contato@site.test', 'contato@site.test'],
  'p_somente entrega so os destinatarios pedidos (abertura e finalizacao do contato)'
);

select is(
  (select count(*)::int from public.reservar_emails_de_ocorrencia(50, null)),
  6,
  'a chamada seguinte nao repete o que ja foi reservado e pula o descartado'
);

reset role;

select is(
  (select array_agg(format('%s|%s', destinatario, status) order by destinatario)
     from public.ocorrencia_emails
    where ocorrencia_id = (select valor from ids_teste where chave = 'oc_com')
      and status not in ('ENVIANDO')),
  array['fim@fora.test|DESCARTADO'],
  'o que esperou mais de 3 dias e descartado; o resto ficou ENVIANDO'
);

-- ---------------------------------------------------------------------------
-- 8) Aviso ao portal
-- ---------------------------------------------------------------------------
create temporary table resultado_do_aviso (disponivel boolean, pedidos int, motivo text);

do $$
declare
  v_antes bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('net.http_request_queue') is null then
    insert into resultado_do_aviso values (false, 0, 'Vault ou pg_net ausentes -- rode `supabase db reset` para o seed.sql liga-los');
    return;
  end if;

  execute $q$select vault.create_secret('segredo-de-teste-0065', 'webhook_user_updated_secret')$q$;
  execute $q$select vault.create_secret('http://127.0.0.1:9/api/webhooks/user-updated', 'webhook_user_updated_url')$q$;
  execute $q$select coalesce(max(id), 0) from net.http_request_queue$q$ into v_antes;

  -- Um comando com dois destinatarios: um pedido so.
  insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario)
  select o.valor, 'ABERTURA', d from ids_teste o, unnest(array['a@x.test', 'b@x.test']) d where o.chave = 'oc_sem';

  execute format(
    $q$insert into resultado_do_aviso
       select true, count(*)::int, null from net.http_request_queue
        where id > %s and url = 'http://127.0.0.1:9/api/webhooks/ocorrencia-emails'$q$,
    v_antes);
end;
$$;

select is(
  (select coalesce(motivo, pedidos::text) from resultado_do_aviso),
  '1',
  'um comando que enfileirou chama o portal uma vez, na URL derivada da do aviso de senha'
);

select * from finish();
rollback;
