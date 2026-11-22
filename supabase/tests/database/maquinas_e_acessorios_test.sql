-- ============================================================================
-- pgTAP -- maquinas e acessorios por site (migration 0111)
--
--   1) So quem administra cadastros cadastra maquina e acessorio.
--   2) O CLIENTE ve so as maquinas dos sites do seu escopo e registra
--      manutencao so nelas; registrado_por e sempre quem esta logado.
--   3) O INSPETOR registra manutencao de maquina.
-- ============================================================================

begin;

select plan(9);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maq.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001112', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maq.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000001113', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maq.cliente@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001111';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001112';
update public.profiles set ativo = true, cargo = 'CLIENTE' where id = 'f0000000-0000-0000-0000-000000001113';

insert into public.grupos_sites (nome) values ('Grupo Maq A 0111'), ('Grupo Maq B 0111');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site ' || nome from public.grupos_sites where nome like 'Grupo Maq _ 0111';
insert into ids_teste (chave, valor) select 'siteA', id from public.sites where nome = 'Site Grupo Maq A 0111';
insert into ids_teste (chave, valor) select 'siteB', id from public.sites where nome = 'Site Grupo Maq B 0111';
-- O cliente so enxerga o grupo A.
insert into public.grupos_sites_clientes (profile_id, grupo_site_id)
  select 'f0000000-0000-0000-0000-000000001113', id from public.grupos_sites where nome = 'Grupo Maq A 0111';

-- 1) Cadastro
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001112", "role": "authenticated"}';

select throws_ok(
  format($$ insert into public.maquinas (site_id, modelo) values (%s, 'Lavadora 0111') $$, (select valor from ids_teste where chave = 'siteA')),
  '42501', null,
  'o INSPETOR nao cadastra maquina'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001111", "role": "authenticated"}';

select lives_ok(
  format($$ insert into public.maquinas (site_id, modelo, patrimonio) values
            (%s, 'Lavadora A 0111', 'PAT-A-0111'), (%s, 'Lavadora B 0111', 'PAT-B-0111') $$,
         (select valor from ids_teste where chave = 'siteA'), (select valor from ids_teste where chave = 'siteB')),
  'o GESTOR cadastra maquinas'
);

select lives_ok(
  format($$ insert into public.site_itens (site_id, tipo, nome, quantidade) values (%s, 'ACESSORIO', 'Extintor 0111', 2) $$,
         (select valor from ids_teste where chave = 'siteA')),
  'o GESTOR cadastra acessorio do site'
);

reset role;
insert into ids_teste (chave, valor) select 'maqA', id from public.maquinas where patrimonio = 'PAT-A-0111';
insert into ids_teste (chave, valor) select 'maqB', id from public.maquinas where patrimonio = 'PAT-B-0111';

-- 2) Cliente
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001113", "role": "authenticated"}';

select is(
  (select array_agg(patrimonio) from public.maquinas where patrimonio like 'PAT-_-0111'),
  array['PAT-A-0111'],
  'o CLIENTE ve so as maquinas dos sites do seu escopo'
);

select lives_ok(
  format($$ insert into public.maquina_manutencoes (maquina_id, tipo, descricao) values (%s, 'AUTONOMA', 'Limpeza') $$,
         (select valor from ids_teste where chave = 'maqA')),
  'o CLIENTE registra manutencao de maquina do seu escopo'
);

select throws_ok(
  format($$ insert into public.maquina_manutencoes (maquina_id, tipo) values (%s, 'AUTONOMA') $$,
         (select valor from ids_teste where chave = 'maqB')),
  '42501', null,
  'o CLIENTE nao registra manutencao fora do seu escopo'
);

select throws_ok(
  format($$ insert into public.site_itens (site_id, tipo, nome) values (%s, 'PRODUTO', 'Forjado') $$,
         (select valor from ids_teste where chave = 'siteA')),
  '42501', null,
  'o CLIENTE nao cadastra acessorio nem produto'
);

-- 3) Inspetor
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001112", "role": "authenticated"}';

select lives_ok(
  format($$ insert into public.maquina_manutencoes (maquina_id, tipo) values (%s, 'PREVENTIVA') $$,
         (select valor from ids_teste where chave = 'maqB')),
  'o INSPETOR registra manutencao de maquina'
);

reset role;

select is(
  (select array_agg(registrado_por order by registrado_por) from public.maquina_manutencoes
    where maquina_id in (select valor from ids_teste where chave in ('maqA', 'maqB'))),
  array['f0000000-0000-0000-0000-000000001112', 'f0000000-0000-0000-0000-000000001113']::uuid[],
  'registrado_por e sempre quem estava logado'
);

select * from finish();
rollback;
