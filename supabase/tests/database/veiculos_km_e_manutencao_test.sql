-- ============================================================================
-- pgTAP -- veiculos, km e manutencao (migration 0104)
--
--   1) So quem administra cadastros cadastra veiculo; CLIENTE nao le.
--   2) Qualquer pessoa da UP registra km; o km atual vira o maior; km menor
--      que o ultimo e recusado; registrado_por e sempre quem esta logado.
--   3) Aos 9.000 km desde a revisao, GESTOR, SUPERVISOR e OPERADOR recebem
--      o aviso (uma vez so); INSPETOR nao.
--   4) A manutencao REVISAO com km zera a contagem.
-- ============================================================================

begin;

select plan(12);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'veic.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'veic.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000001043', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'veic.operador@teste.local'),
  ('f0000000-0000-0000-0000-000000001044', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'veic.cliente@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001041';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001042';
update public.profiles set ativo = true, cargo = 'OPERADOR' where id = 'f0000000-0000-0000-0000-000000001043';
update public.profiles set ativo = true, cargo = 'CLIENTE' where id = 'f0000000-0000-0000-0000-000000001044';

-- ---------------------------------------------------------------------------
-- 1) Cadastro
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001042", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.veiculos (placa, modelo) values ('TST1A04', 'Carro do inspetor') $$,
  '42501', null,
  'o INSPETOR nao cadastra veiculo'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001041", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.veiculos (placa, modelo, usuario_id, km_ultima_revisao)
     values ('TST1A04', 'Carro 0104', 'f0000000-0000-0000-0000-000000001042', 20000) $$,
  'o GESTOR cadastra veiculo'
);

select throws_ok(
  $$ update public.veiculos set km_atual = 99999 where placa = 'TST1A04' $$,
  '42501', null,
  'ninguem escreve km_atual direto'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001044", "role": "authenticated"}';

select is(
  (select count(*)::int from public.veiculos where placa = 'TST1A04'),
  0,
  'o CLIENTE nao ve os veiculos'
);

-- ---------------------------------------------------------------------------
-- 2) Km
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001042", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.veiculo_km (veiculo_id, km)
     select id, 25000 from public.veiculos where placa = 'TST1A04' $$,
  'o INSPETOR registra o km'
);

select is(
  (select km_atual from public.veiculos where placa = 'TST1A04'),
  25000,
  'o km atual passa a ser o registrado'
);

select throws_ok(
  $$ insert into public.veiculo_km (veiculo_id, km)
     select id, 24000 from public.veiculos where placa = 'TST1A04' $$,
  '22023', null,
  'km menor que o ultimo e recusado'
);

select is(
  (select registrado_por from public.veiculo_km k join public.veiculos v on v.id = k.veiculo_id where v.placa = 'TST1A04'),
  'f0000000-0000-0000-0000-000000001042'::uuid,
  'registrado_por e quem esta logado'
);

-- ---------------------------------------------------------------------------
-- 3) Aviso aos 9.000 km (revisao em 20.000: aviso a partir de 29.000)
-- ---------------------------------------------------------------------------
insert into public.veiculo_km (veiculo_id, km)
  select id, 29500 from public.veiculos where placa = 'TST1A04';
insert into public.veiculo_km (veiculo_id, km)
  select id, 29800 from public.veiculos where placa = 'TST1A04';

reset role;
insert into ids_teste select 'veiculo', id from public.veiculos where placa = 'TST1A04';

select is(
  (select array_agg(p.email order by p.email)
     from public.notificacoes n
     join public.profiles p on p.id = n.destinatario_id
    where n.tipo = 'REVISAO_VEICULO' and p.email like 'veic.%'),
  array['veic.gestor@teste.local', 'veic.operador@teste.local'],
  'aos 9.000 km, GESTOR e OPERADOR recebem o aviso uma vez so; INSPETOR e CLIENTE nao'
);

-- ---------------------------------------------------------------------------
-- 4) Revisao zera a contagem
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001043", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.veiculo_manutencoes (veiculo_id, tipo, km, descricao)
     select id, 'REVISAO', 30000, 'Revisao dos 30 mil' from public.veiculos where placa = 'TST1A04' $$,
  'o OPERADOR registra a revisao'
);

select is(
  (select km_ultima_revisao from public.veiculos where placa = 'TST1A04'),
  30000,
  'a revisao com km passa a ser a ultima revisao'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001044", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.veiculo_manutencoes (veiculo_id, tipo, descricao)
     values ((select valor from ids_teste where chave = 'veiculo'), 'OUTRA', 'x') $$,
  '42501', null,
  'o CLIENTE nao registra manutencao de veiculo'
);

reset role;

select * from finish();
rollback;
