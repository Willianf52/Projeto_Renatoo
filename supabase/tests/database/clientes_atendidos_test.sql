-- ============================================================================
-- pgTAP -- clientes atendidos (migration 0113)
--
--   1) So o GESTOR salva a lista; o SUPERVISOR nao.
--   2) Salvar troca a lista inteira (tira o que saiu, poe o que entrou).
--   3) Ninguem grava direto na tabela; o CLIENTE nao le.
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001131', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cli.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001132', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cli.supervisor@teste.local'),
  ('f0000000-0000-0000-0000-000000001133', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cli.cliente@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001131';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'f0000000-0000-0000-0000-000000001132';
update public.profiles set ativo = true, cargo = 'CLIENTE' where id = 'f0000000-0000-0000-0000-000000001133';

insert into public.grupos_sites (nome) values ('Cli A 0113'), ('Cli B 0113'), ('Cli C 0113');
insert into ids_teste (chave, valor) select right(nome, 6), id from public.grupos_sites where nome like 'Cli _ 0113';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001132", "role": "authenticated"}';

select throws_ok(
  format($$ select public.salvar_clientes_atendidos('f0000000-0000-0000-0000-000000001132', array[%s]::bigint[]) $$,
         (select valor from ids_teste where chave = 'A 0113')),
  '42501', null,
  'o SUPERVISOR nao salva a propria lista'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001131", "role": "authenticated"}';

select lives_ok(
  format($$ select public.salvar_clientes_atendidos('f0000000-0000-0000-0000-000000001132', array[%s, %s]::bigint[]) $$,
         (select valor from ids_teste where chave = 'A 0113'), (select valor from ids_teste where chave = 'B 0113')),
  'o GESTOR salva os clientes do supervisor'
);

select public.salvar_clientes_atendidos('f0000000-0000-0000-0000-000000001132',
  array[(select valor from ids_teste where chave = 'B 0113'), (select valor from ids_teste where chave = 'C 0113')]);

select is(
  (select array_agg(g.nome order by g.nome) from public.clientes_atendidos c join public.grupos_sites g on g.id = c.grupo_site_id
    where c.usuario_id = 'f0000000-0000-0000-0000-000000001132'),
  array['Cli B 0113', 'Cli C 0113'],
  'salvar troca a lista inteira: tira o A, mantem o B, poe o C'
);

select throws_ok(
  $$ insert into public.clientes_atendidos (usuario_id, grupo_site_id)
     values ('f0000000-0000-0000-0000-000000001132', 1) $$,
  '42501', null,
  'ninguem grava direto na tabela'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001132", "role": "authenticated"}';

select is(
  (select count(*)::int from public.clientes_atendidos where usuario_id = 'f0000000-0000-0000-0000-000000001132'),
  2,
  'o supervisor ve os clientes que atende'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001133", "role": "authenticated"}';

select is(
  (select count(*)::int from public.clientes_atendidos),
  0,
  'o CLIENTE nao le a lista'
);

reset role;

select * from finish();
rollback;
