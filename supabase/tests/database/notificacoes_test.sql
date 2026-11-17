-- ============================================================================
-- pgTAP -- notificacoes (migration 0103)
--
--   1) `manutencao.notificar` cria uma por pessoa ativa, ignora a inativa e,
--      com chave, nao repete o aviso.
--   2) Cada pessoa le so as proprias.
--   3) Marca como lida so as proprias: a de outra pessoa nao muda (zero
--      linhas, sem erro).
--   4) `authenticated` nao cria notificacao nem muda o titulo; nao chama
--      `manutencao.notificar`.
-- ============================================================================

begin;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notif.ana@teste.local'),
  ('f0000000-0000-0000-0000-000000001032', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notif.bia@teste.local'),
  ('f0000000-0000-0000-0000-000000001033', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notif.inativa@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR' where id in ('f0000000-0000-0000-0000-000000001031', 'f0000000-0000-0000-0000-000000001032');
update public.profiles set ativo = false, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001033';

-- ---------------------------------------------------------------------------
-- 1) Criacao pelo banco
-- ---------------------------------------------------------------------------
select is(
  manutencao.notificar(
    array['f0000000-0000-0000-0000-000000001031', 'f0000000-0000-0000-0000-000000001032', 'f0000000-0000-0000-0000-000000001033']::uuid[],
    'TESTE', 'Aviso de teste', 'Texto', '/dashboard', 'teste:0103'),
  2,
  'notificar cria uma por pessoa ativa e ignora a inativa'
);

select is(
  manutencao.notificar(array['f0000000-0000-0000-0000-000000001031']::uuid[], 'TESTE', 'De novo', '', null, 'teste:0103'),
  0,
  'com a mesma chave, o aviso nao se repete'
);

-- ---------------------------------------------------------------------------
-- 2) e 3) Leitura e marcacao como a Ana
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001031", "role": "authenticated"}';

select is(
  (select count(*)::int from public.notificacoes),
  1,
  'cada pessoa le so as proprias notificacoes'
);

select is(
  (with m as (update public.notificacoes set lida_em = now() returning 1) select count(*)::int from m),
  1,
  'a pessoa marca as proprias como lidas'
);

reset role;
select is(
  (select count(*)::int from public.notificacoes
    where destinatario_id = 'f0000000-0000-0000-0000-000000001032' and lida_em is null),
  1,
  'marcar como lida nao alcanca a notificacao de outra pessoa'
);

-- ---------------------------------------------------------------------------
-- 4) O que authenticated nao pode
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001031", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.notificacoes (destinatario_id, tipo, titulo)
     values ('f0000000-0000-0000-0000-000000001031', 'TESTE', 'Forjada') $$,
  '42501', null,
  'authenticated nao cria notificacao'
);

select throws_ok(
  $$ update public.notificacoes set titulo = 'Trocado' $$,
  '42501', null,
  'authenticated nao muda o titulo'
);

select throws_ok(
  $$ select manutencao.notificar(array['f0000000-0000-0000-0000-000000001032']::uuid[], 'TESTE', 'X') $$,
  '42501', null,
  'authenticated nao chama manutencao.notificar'
);

reset role;

select ok(
  not has_table_privilege('anon', 'public.notificacoes', 'select'),
  'anon nao le notificacoes'
);

select * from finish();
rollback;
