-- ============================================================================
-- pgTAP — eventos de uso (migration 0051)
--
-- O que nao pode quebrar calado:
--   1) o autor vem do banco, nao do cliente -- nem `perfil_id` nem `cargo`
--      sao gravaveis pela sessao;
--   2) o teto de tamanho e a lista fechada de eventos seguram lixo;
--   3) so a gestao le; quem registra nao le o que os outros registraram;
--   4) conta inativa e `anon` nao registram nada.
-- ============================================================================

begin;

select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('e5100000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0051@teste.local'),
  ('e5100000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.0051@teste.local'),
  ('e5100000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo.0051@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'e5100000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'e5100000-0000-0000-0000-000000000002';
update public.profiles set ativo = false, cargo = 'OPERADOR'
  where id = 'e5100000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1) OPERADOR registra; o banco carimba o autor
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e5100000-0000-0000-0000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.eventos_de_uso (evento, detalhes)
     values ('tela_aberta', '{"rota": "/dashboard/inspecoes/coletas-importadas", "filtros": ["data_inicial"]}') $$,
  'OPERADOR ativo registra tela aberta'
);

select throws_ok(
  $$ insert into public.eventos_de_uso (evento, perfil_id)
     values ('login', 'e5100000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'a sessao nao escreve perfil_id -- nao registra evento em nome de outra pessoa'
);

select throws_ok(
  $$ insert into public.eventos_de_uso (evento, cargo) values ('login', 'GESTOR') $$,
  '42501',
  null,
  'a sessao nao escreve cargo -- nao se declara GESTOR na telemetria'
);

select throws_ok(
  $$ insert into public.eventos_de_uso (evento) values ('checklist_enviado') $$,
  '23514',
  null,
  'evento fora da lista e recusado'
);

select throws_ok(
  format(
    $f$ insert into public.eventos_de_uso (evento, detalhes) values ('tela_aberta', jsonb_build_object('x', %L)) $f$,
    repeat('a', 3000)
  ),
  '23514',
  null,
  'detalhes acima do teto de tamanho e recusado'
);

-- Quem registra nao le: a policy de SELECT e so da gestao.
select is(
  (select count(*)::int from public.eventos_de_uso),
  0,
  'OPERADOR nao le eventos de uso'
);
reset role;

-- Conferido como dono: o trigger carimbou o autor real.
select is(
  (select perfil_id::text || '|' || cargo from public.eventos_de_uso
    where detalhes ->> 'rota' = '/dashboard/inspecoes/coletas-importadas'),
  'e5100000-0000-0000-0000-000000000002|OPERADOR',
  'perfil_id e cargo vem de auth.uid() e profiles, nao do cliente'
);

-- ---------------------------------------------------------------------------
-- 2) GESTOR le
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e5100000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.eventos_de_uso (evento) values ('login') $$,
  'GESTOR ativo registra login'
);

select cmp_ok(
  (select count(*)::int from public.eventos_de_uso
    where perfil_id in ('e5100000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000002')),
  '=',
  2,
  'GESTOR le os eventos de todos'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3) Conta inativa e anon nao registram
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e5100000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.eventos_de_uso (evento) values ('login') $$,
  '42501',
  null,
  'conta inativa nao registra evento'
);
reset role;

set local role anon;
select throws_ok(
  $$ insert into public.eventos_de_uso (evento) values ('login') $$,
  '42501',
  null,
  'anon nao registra evento'
);
reset role;

select * from finish();

rollback;
