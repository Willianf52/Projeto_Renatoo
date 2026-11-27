-- ============================================================================
-- pgTAP -- relatorio de uso do portal (0117)
--
--   1) Quem acompanha o uso (0118) ve a soma de todo mundo.
--   2) Os demais, GESTOR fora da lista incluso, so veem o proprio uso.
--   6) pode_ver_uso_do_portal responde pela lista.
--   3) Telas: aberturas e pessoas distintas por rota.
--   4) Filtro de cargo e periodo invalido.
--   5) anon nao executa.
-- ============================================================================

begin;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('e5117000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0117@teste.local'),
  ('e5117000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.0117@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR', nome_completo = 'Gestor 0117'
  where id = 'e5117000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'OPERADOR', nome_completo = 'Operador 0117'
  where id = 'e5117000-0000-0000-0000-000000000002';

insert into auth.users (id, instance_id, aud, role, email)
values ('e5117000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outrogestor.0117@teste.local');
update public.profiles set ativo = true, cargo = 'GESTOR', nome_completo = 'Outro Gestor 0117'
  where id = 'e5117000-0000-0000-0000-000000000003';

-- So o primeiro GESTOR acompanha o uso (0118).
insert into manutencao.quem_acompanha_o_uso (perfil_id) values ('e5117000-0000-0000-0000-000000000001');

create temporary table hoje_0117 as select (now() at time zone 'America/Sao_Paulo')::date as dia;
grant select on hoje_0117 to public;

-- Eventos de cada um, gravados com a sessao (o banco carimba autor e cargo).
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e5117000-0000-0000-0000-000000000002", "role": "authenticated"}';
insert into public.eventos_de_uso (evento, detalhes) values
  ('login', '{}'),
  ('tela_aberta', '{"rota": "/dashboard/teste-0117/a", "filtros": []}'),
  ('tela_aberta', '{"rota": "/dashboard/teste-0117/a", "filtros": []}');

set local "request.jwt.claims" to '{"sub": "e5117000-0000-0000-0000-000000000001", "role": "authenticated"}';
insert into public.eventos_de_uso (evento, detalhes) values
  ('login', '{}'),
  ('login', '{}'),
  ('tela_aberta', '{"rota": "/dashboard/teste-0117/a", "filtros": []}'),
  ('tela_aberta', '{"rota": "/dashboard/teste-0117/b", "filtros": []}');

-- 6) a lista decide
select ok(public.pode_ver_uso_do_portal(), 'quem esta na lista pode ver o uso do portal');

-- 1) quem acompanha ve os dois
select results_eq(
  $$ select nome, cargo, logins, telas, dias_com_acesso
       from public.relatorio_uso_do_portal((select dia from hoje_0117), (select dia from hoje_0117))
      where nome like '% 0117' order by nome $$,
  $$ values ('Gestor 0117'::text, 'GESTOR'::text, 2, 2, 1), ('Operador 0117'::text, 'OPERADOR'::text, 1, 2, 1) $$,
  'GESTOR ve logins, telas e dias de cada pessoa'
);

-- 3) Telas: rota a aberta 3 vezes por 2 pessoas, rota b 1 vez por 1
select results_eq(
  $$ select rota, aberturas, pessoas
       from public.relatorio_telas_do_portal((select dia from hoje_0117), (select dia from hoje_0117))
      where rota like '/dashboard/teste-0117/%' order by rota $$,
  $$ values ('/dashboard/teste-0117/a'::text, 3, 2), ('/dashboard/teste-0117/b'::text, 1, 1) $$,
  'telas somam aberturas e pessoas distintas'
);

-- 4) Filtro de cargo
select is(
  (select count(*)::integer from public.relatorio_uso_do_portal((select dia from hoje_0117), (select dia from hoje_0117), 'OPERADOR')
    where nome like '% 0117'),
  1,
  'filtro de cargo deixa so o OPERADOR'
);

select throws_ok(
  $$ select * from public.relatorio_uso_do_portal((select dia from hoje_0117), (select dia from hoje_0117) - 1) $$,
  '22023', null, 'data final antes da inicial e recusada'
);

select throws_ok(
  $$ select * from public.relatorio_telas_do_portal((select dia from hoje_0117) - 400, (select dia from hoje_0117)) $$,
  '22023', null, 'periodo acima de 366 dias e recusado'
);

-- Periodo sem nada (ontem) nao traz estas pessoas
select is(
  (select count(*)::integer from public.relatorio_uso_do_portal((select dia from hoje_0117) - 1, (select dia from hoje_0117) - 1)
    where nome like '% 0117'),
  0,
  'fora do periodo nao conta'
);

-- 2) OPERADOR so ve o proprio uso
set local "request.jwt.claims" to '{"sub": "e5117000-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ select nome from public.relatorio_uso_do_portal((select dia from hoje_0117), (select dia from hoje_0117)) $$,
  $$ values ('Operador 0117'::text) $$,
  'OPERADOR so ve a propria linha'
);

select is(
  (select aberturas from public.relatorio_telas_do_portal((select dia from hoje_0117), (select dia from hoje_0117))
    where rota = '/dashboard/teste-0117/a'),
  2,
  'OPERADOR so soma as proprias telas'
);

-- 2b) GESTOR fora da lista: nao ve nem o uso do outro GESTOR
set local "request.jwt.claims" to '{"sub": "e5117000-0000-0000-0000-000000000003", "role": "authenticated"}';

select ok(not public.pode_ver_uso_do_portal(), 'GESTOR fora da lista nao pode ver o uso do portal');

select is(
  (select count(*)::integer from public.relatorio_uso_do_portal((select dia from hoje_0117), (select dia from hoje_0117))
    where nome like '% 0117'),
  0,
  'GESTOR fora da lista nao ve o uso dos outros'
);

-- 5) anon
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.relatorio_uso_do_portal(current_date, current_date) $$,
  '42501', null, 'anon nao executa o relatorio'
);

select * from finish();
rollback;
