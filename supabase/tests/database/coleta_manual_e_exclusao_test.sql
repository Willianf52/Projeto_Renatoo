-- ============================================================================
-- pgTAP — cadastro manual e exclusao de coleta (migration 0067)
--
--   1) INSPETOR e SUPERVISOR nao cadastram -- 42501.
--   2) GESTOR cadastra 3: tres visitas do funcionario escolhido, uma leitura
--      cada, com "Cadastro manual"; auditoria com o autor.
--   3) Quantidade e data fora da faixa -- 22023 / 22008.
--   4) SUPERVISOR nao exclui; GESTOR exclui, e a visita vazia sai junto.
--   5) Coleta de visita com checklist fica -- 23514.
--   6) Funcoes dos triggers fora do alcance de `authenticated`; RPC fora de `anon`.
--   7) Fora da funcao, a 0060 segue: GESTOR nao grava em nome de outro.
-- ============================================================================

begin;

select plan(15);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000671', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'col.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000672', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'col.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000673', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'col.supervisor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000671';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000672';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'f0000000-0000-0000-0000-000000000673';

insert into public.grupos_sites (nome) values ('Grupo Coleta 0067');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Coleta 0067' from public.grupos_sites where nome = 'Grupo Coleta 0067';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Coleta 0067';

insert into public.modelos_checklist (nome) values ('Modelo Coleta 0067');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Coleta 0067';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select m.id, 1, 'Pergunta 1 0067', 'CNA' from public.modelos_checklist m where m.nome = 'Modelo Coleta 0067';
insert into ids_teste (chave, valor) select 'p1', id from public.perguntas_checklist where texto = 'Pergunta 1 0067';

-- Uma visita do INSPETOR com leitura e checklist enviado.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values ('96701', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672');
insert into ids_teste (chave, valor) select 'visita_ck', id from public.visitas where numero_coleta = '96701';
insert into public.leituras (visita_id, data_hora)
  values ((select valor from ids_teste where chave = 'visita_ck'), now() - interval '1 hour');
insert into ids_teste (chave, valor)
  select 'leitura_ck', id from public.leituras where visita_id = (select valor from ids_teste where chave = 'visita_ck');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000672", "role": "authenticated"}';

select public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_ck'), 'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_ck')),
  array[]::text[],
  jsonb_build_array(jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p1'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo'));

-- ---------------------------------------------------------------------------
-- Quem nao e GESTOR nao cadastra
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.cadastrar_coletas_manuais(%L, %L, now() - interval '1 day', 1) $$,
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672'),
  '42501', null,
  'INSPETOR nao cadastra coleta manual'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000673", "role": "authenticated"}';

select throws_ok(
  format($$ select public.cadastrar_coletas_manuais(%L, %L, now() - interval '1 day', 1) $$,
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672'),
  '42501', null,
  'SUPERVISOR nao cadastra coleta manual'
);

reset role;

-- ---------------------------------------------------------------------------
-- GESTOR cadastra
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000671", "role": "authenticated"}';

select is(
  public.cadastrar_coletas_manuais(
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672',
    now() - interval '2 days', 3),
  3,
  'GESTOR cadastra tres coletas'
);

select throws_ok(
  format($$ select public.cadastrar_coletas_manuais(%L, %L, now() - interval '1 day', 51) $$,
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672'),
  '22023', null,
  'mais de 50 coletas de uma vez e recusado'
);

select throws_ok(
  format($$ select public.cadastrar_coletas_manuais(%L, %L, now() - interval '40 days', 1) $$,
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672'),
  '22008', null,
  'data fora da janela de 30 dias e recusada'
);

reset role;

select is(
  (select count(*)::int
     from public.leituras l
     join public.visitas v on v.id = l.visita_id
    where v.site_id = (select valor from ids_teste where chave = 'site')
      and v.funcionario_id = 'f0000000-0000-0000-0000-000000000672'
      and l.observacao = 'Cadastro manual'
      and l.data_integracao is not null),
  3,
  'tres visitas do funcionario escolhido, uma leitura cada, marcadas como cadastro manual e integradas'
);

select is(
  (select count(*)::int from public.auditoria
    where tabela = 'leituras' and operacao = 'INSERT' and ator_id = 'f0000000-0000-0000-0000-000000000671'),
  3,
  'a auditoria guarda quem cadastrou cada coleta'
);

insert into ids_teste (chave, valor)
  select 'leitura_manual', min(l.id) from public.leituras l where l.observacao = 'Cadastro manual'
    and l.visita_id in (select id from public.visitas where site_id = (select valor from ids_teste where chave = 'site'));
insert into ids_teste (chave, valor)
  select 'visita_manual', visita_id from public.leituras where id = (select valor from ids_teste where chave = 'leitura_manual');

-- ---------------------------------------------------------------------------
-- Exclusao
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000673", "role": "authenticated"}';

delete from public.leituras where id = (select valor from ids_teste where chave = 'leitura_manual');

reset role;

select is(
  (select count(*)::int from public.leituras where id = (select valor from ids_teste where chave = 'leitura_manual')),
  1,
  'SUPERVISOR nao alcanca a linha: a coleta continua'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000671", "role": "authenticated"}';

-- DELETE com RETURNING so vale em CTE no topo, nao dentro do `is()`.
with excluidas as (
  delete from public.leituras where id = (select valor from ids_teste where chave = 'leitura_manual')
  returning id
)
select is((select count(*)::int from excluidas), 1, 'GESTOR exclui a coleta');

select throws_ok(
  format($$ delete from public.leituras where id = %L $$, (select valor from ids_teste where chave = 'leitura_ck')),
  '23514', null,
  'coleta de visita com checklist enviado nao e excluida'
);

reset role;

select is(
  (select count(*)::int from public.visitas where id = (select valor from ids_teste where chave = 'visita_manual')),
  0,
  'a visita que ficou vazia sai junto'
);

select is(
  (select count(*)::int from public.auditoria
    where operacao = 'DELETE' and ator_id = 'f0000000-0000-0000-0000-000000000671'
      and ((tabela = 'leituras' and registro_id = (select valor from ids_teste where chave = 'leitura_manual')::text)
        or (tabela = 'visitas' and registro_id = (select valor from ids_teste where chave = 'visita_manual')::text))),
  2,
  'a auditoria guarda a leitura e a visita excluidas, com quem excluiu'
);

select ok(
  not has_function_privilege('authenticated', 'manutencao.coleta_com_checklist_fica()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'manutencao.visita_vazia_sai()', 'EXECUTE'),
  'authenticated nao executa as funcoes dos triggers'
);

select ok(
  not has_function_privilege('anon', 'public.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'escrita.cadastrar_coletas_manuais(bigint, uuid, timestamptz, integer, bigint, bigint, bigint, bigint, bigint)', 'EXECUTE'),
  'anon nao chama o cadastro manual, nem o envelope nem o trabalho'
);

-- A 0060 segue valendo: fora da funcao, o GESTOR nao grava em nome de outro.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000671", "role": "authenticated"}';

select throws_ok(
  format($$ insert into public.visitas (numero_coleta, site_id, funcionario_id) values ('96799', %L, %L) $$,
    (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000672'),
  '42501', null,
  'INSERT direto em nome de outro funcionario continua fechado (0060)'
);

reset role;

select * from finish();
rollback;
