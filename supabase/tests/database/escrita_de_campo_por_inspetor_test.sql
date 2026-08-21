-- ============================================================================
-- pgTAP — escrita de campo por INSPETOR (migration 0036)
--
-- Cobre o que a migration abre e o que ela continua fechando:
--
--   1) INSPETOR grava a propria visita e leituras dela -- sucesso.
--   2) INSPETOR nao grava visita em nome de outro funcionario (forjar
--      funcionario_id alheio) -- nega.
--   3) INSPETOR nao grava leitura numa visita que nao e sua -- nega.
--   4) INSPETOR inativo nao grava nada -- nega (usuario_ativo() entra na
--      conjuncao de e_inspetor()).
--   5) Outro cargo (OPERADOR) continua sem conseguir gravar visitas/leituras
--      pela sessao -- confirma que o grant novo (passo 3 da migration) nao
--      abriu mais do que a policy permite.
--
-- Ids de outra pessoa/site sao capturados numa tabela temporaria SEM RLS
-- antes de trocar de role, e usados como literal na tentativa de escrita.
-- Sem isso, a tentativa vira `insert ... select ... from visitas where ...`
-- e a policy de SELECT (0006/0014) filtra a linha alheia antes mesmo do
-- INSERT tentar -- 0 linhas afetadas, sem excecao nenhuma, e o teste passa
-- pelo motivo errado (achado no primeiro ensaio deste arquivo).
--
-- Executado (2026-08-21) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual. 6/6 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture: dois INSPETOR (A e B), um INSPETOR inativo, um OPERADOR, mais um
-- site minimo para a visita/leitura terem onde pendurar.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.a@teste.local'),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.b@teste.local'),
  ('f0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.inativo@teste.local'),
  ('f0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.campo@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002');
update public.profiles set ativo = false, cargo = 'INSPETOR'
  where id = 'f0000000-0000-0000-0000-000000000003';
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'f0000000-0000-0000-0000-000000000004';

insert into public.grupos_sites (nome) values ('Grupo Teste Inspetor');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Teste Inspetor' from public.grupos_sites where nome = 'Grupo Teste Inspetor';

insert into ids_teste (chave, valor)
  select 'site', id from public.sites where nome = 'Site Teste Inspetor';

-- ---------------------------------------------------------------------------
-- 1) INSPETOR grava a propria visita e a propria leitura.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9001, s.id, 'f0000000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site Teste Inspetor';

insert into public.leituras (visita_id, data_hora)
  select v.id, now()
  from public.visitas v where v.numero_coleta = 9001;

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = 9001),
  1,
  'INSPETOR grava a propria visita e a propria leitura'
);

reset role;

insert into ids_teste (chave, valor) select 'visita_a', id from public.visitas where numero_coleta = 9001;

-- ---------------------------------------------------------------------------
-- 2) INSPETOR A nao grava visita em nome do INSPETOR B.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
     select 9002, s.id, 'f0000000-0000-0000-0000-000000000002'
     from public.sites s where s.nome = 'Site Teste Inspetor' $$,
  '42501',
  null,
  'INSPETOR nao grava visita em nome de outro funcionario'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3) INSPETOR A nao grava leitura numa visita do INSPETOR B.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9003, s.id, 'f0000000-0000-0000-0000-000000000002'
  from public.sites s where s.nome = 'Site Teste Inspetor';

reset role;

insert into ids_teste (chave, valor) select 'visita_b', id from public.visitas where numero_coleta = 9003;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now()) $$,
    (select valor from ids_teste where chave = 'visita_b')
  ),
  '42501',
  null,
  'INSPETOR nao grava leitura em visita que nao e sua'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4) INSPETOR inativo nao grava nada.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values (9004, %L, 'f0000000-0000-0000-0000-000000000003') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '42501',
  null,
  'INSPETOR inativo nao grava visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5) OPERADOR continua sem conseguir gravar (grant novo nao abriu mais que a
-- policy permite -- a policy exige e_inspetor(), que OPERADOR nunca satisfaz).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values (9005, %L, 'f0000000-0000-0000-0000-000000000004') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '42501',
  null,
  'OPERADOR continua sem gravar visitas pela sessao'
);

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now()) $$,
    (select valor from ids_teste where chave = 'visita_a')
  ),
  '42501',
  null,
  'OPERADOR continua sem gravar leituras pela sessao'
);

reset role;

select * from finish();

rollback;
