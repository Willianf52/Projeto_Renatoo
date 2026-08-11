-- ============================================================================
-- pgTAP — escopo do CLIENTE
--
-- Cobre a migration 0014. Duas coisas precisam ser verdade ao mesmo tempo, e
-- elas puxam em direcoes opostas:
--
--   1) O CLIENTE passa a enxergar a operacao dos proprios grupos -- antes via
--      a tela vazia, porque nenhuma policy o contemplava.
--   2) O CLIENTE NAO enxerga a de outro cliente. Antes da 0014, as policies de
--      `sites`/`grupos_sites`/`qr_codes` eram `usuario_ativo()` puro: ativar um
--      CLIENTE entregaria a ele os sites de todos, com coordenadas, mais o
--      codigo de todo checkpoint. E o mesmo vazamento que a 0008 fechou para
--      conta criada de fora.
--
-- E verifica a terceira, que e a que quebraria calado: quem NAO e cliente
-- continua vendo tudo, sem depender de vinculo nenhum.
--
-- Executado (2026-08-11) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual. 10/10 asserts passaram; nada persistiu. Achado
-- na primeira tentativa: `where id like` nao compila contra uma coluna uuid
-- sem cast -- corrigido para `id::text like` abaixo. `pnpm test:db` continua
-- sendo o caminho de verdade quando houver Docker.
-- ============================================================================

begin;

select plan(10);

-- Fixture: dois clientes, cada um com o seu grupo, mais um gestor.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.a@teste.local'),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.b@teste.local'),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.escopo@teste.local'),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.escopo@teste.local');

update public.profiles set ativo = true where id::text like 'c0000000%';
update public.profiles set cargo = 'CLIENTE'  where id in (
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002'
);
update public.profiles set cargo = 'GESTOR'   where id = 'c0000000-0000-0000-0000-000000000003';
update public.profiles set cargo = 'OPERADOR' where id = 'c0000000-0000-0000-0000-000000000004';

insert into public.grupos_sites (nome) values ('Grupo do cliente A'), ('Grupo do cliente B');

insert into public.sites (grupo_site_id, nome)
select id, 'Site do ' || nome from public.grupos_sites
where nome in ('Grupo do cliente A', 'Grupo do cliente B');

insert into public.qr_codes (codigo, site_id)
select 'QR-' || s.id, s.id from public.sites s
join public.grupos_sites g on g.id = s.grupo_site_id
where g.nome in ('Grupo do cliente A', 'Grupo do cliente B');

insert into public.visitas (numero_coleta, site_id)
select 1000 + s.id, s.id from public.sites s
join public.grupos_sites g on g.id = s.grupo_site_id
where g.nome in ('Grupo do cliente A', 'Grupo do cliente B');

insert into public.leituras (visita_id, data_hora)
select v.id, now() from public.visitas v
join public.sites s on s.id = v.site_id
join public.grupos_sites g on g.id = s.grupo_site_id
where g.nome in ('Grupo do cliente A', 'Grupo do cliente B');

-- Cada cliente vinculado ao seu grupo.
insert into public.grupos_sites_clientes (grupo_site_id, profile_id)
select id, 'c0000000-0000-0000-0000-000000000001' from public.grupos_sites where nome = 'Grupo do cliente A';
insert into public.grupos_sites_clientes (grupo_site_id, profile_id)
select id, 'c0000000-0000-0000-0000-000000000002' from public.grupos_sites where nome = 'Grupo do cliente B';

-- ---------------------------------------------------------------------------
-- Cliente A: ve o proprio grupo, e so ele.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "c0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select is(
  (select count(*)::int from public.grupos_sites where nome like 'Grupo do cliente%'),
  1,
  'CLIENTE ve apenas o proprio grupo de sites'
);

select is(
  (select count(*)::int from public.sites where nome like 'Site do Grupo do cliente%'),
  1,
  'CLIENTE ve apenas os sites do proprio grupo'
);

-- A 0008 registra que a lista de checkpoints e justamente o que nao pode vazar.
select is(
  (select count(*)::int from public.qr_codes where codigo like 'QR-%'),
  1,
  'CLIENTE ve apenas os qr_codes do proprio grupo'
);

-- O ponto 1: antes da 0014 esta contagem era zero, e a tela abria vazia.
select is(
  (select count(*)::int from public.visitas where numero_coleta >= 1000),
  1,
  'CLIENTE ve as visitas do proprio grupo (antes da 0014 via nenhuma)'
);

select is(
  (select count(*)::int from public.leituras),
  1,
  'CLIENTE ve as leituras do proprio grupo'
);

reset role;

-- ---------------------------------------------------------------------------
-- Cliente B: o mesmo, do outro lado -- garante que o recorte segue o vinculo e
-- nao a ordem de insercao.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "c0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count(*)::int from public.grupos_sites where nome = 'Grupo do cliente A'),
  0,
  'CLIENTE B nao ve o grupo do CLIENTE A'
);

select is(
  (select count(*)::int from public.visitas where numero_coleta >= 1000),
  1,
  'CLIENTE B ve so a visita do proprio grupo'
);

reset role;

-- ---------------------------------------------------------------------------
-- Quem nao e cliente segue vendo tudo, sem vinculo nenhum. E o caso que
-- quebraria calado: uma policy escrita so para o cliente esvaziaria as telas
-- de todo o resto.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "c0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is(
  (select count(*)::int from public.sites where nome like 'Site do Grupo do cliente%'),
  2,
  'GESTOR ve os sites dos dois clientes, sem vinculo nenhum'
);

select is(
  (select count(*)::int from public.visitas where numero_coleta >= 1000),
  2,
  'GESTOR ve as visitas dos dois clientes'
);

reset role;

-- OPERADOR nao e gestao e nao e cliente: ve os cadastros (precisa deles para
-- os filtros) mas nenhuma visita alheia, exatamente como antes da 0014.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "c0000000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is(
  (select count(*)::int from public.sites where nome like 'Site do Grupo do cliente%'),
  2,
  'OPERADOR segue vendo os sites, como antes da 0014'
);

reset role;

select * from finish();

rollback;
