-- ============================================================================
-- pgTAP — grants de escrita fechados (migration 0031)
--
-- Cobre os tres achados que a 0031 fecha, e o contraste que provaria a
-- correcao errada:
--
--   1) `anon` e `authenticated` nao escrevem nas tabelas cuja unica policy e
--      de SELECT (0003/0004/0014) -- entre elas `visitas` e `leituras`, o
--      registro de inspecao.
--   2) `profiles` nao aceita INSERT de `authenticated`. As 0002/0007 fecharam
--      UPDATE coluna a coluna para proteger `cargo` e `ativo`, mas INSERT
--      nunca foi revogado e o default privilege o concedia em todas as
--      colunas -- a mesma escalada, por outra porta.
--   3) `sincronizar_membros_grupo_usuarios` deixa de ser chamavel por `anon`.
--
-- ATENCAO ao metodo, porque a armadilha aqui e sutil: RLS negando por AUSENCIA
-- de policy e GRANT faltando levantam **o mesmo SQLSTATE 42501**. Um teste
-- so com `throws_ok(..., '42501')` passaria identico antes e depois da
-- migration, provando nada. Por isso os asserts principais consultam o
-- catalogo (`has_table_privilege`, `has_function_privilege`, `pg_default_acl`)
-- -- que e exatamente o que a 0031 muda -- e os comportamentais checam a
-- MENSAGEM do erro ("permission denied"), nao so o codigo.
--
-- O terceiro lado, o que quebraria calado: as telas de cadastro continuam
-- escrevendo. Um `revoke ... on all tables` (em vez da lista explicita da
-- 0031) levaria junto os grants por coluna das 0009/0012/0015/0016/0024 e
-- derrubaria os cinco cadastros de uma vez, sem erro nenhum nesta suite se ela
-- so olhasse o lado negativo.
--
-- Executado (2026-08-18) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback, com o SQL da 0031 aplicado na mesma
-- transacao antes dos asserts -- branch de desenvolvimento nao esta disponivel
-- no plano atual. 21/21 asserts passaram; nada persistiu. `pnpm test:db`
-- continua sendo o caminho de verdade quando houver Docker.
-- ============================================================================

begin;

select plan(21);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operacional.grants@teste.local'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.grants@teste.local'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.grants@teste.local');

update public.profiles set ativo = true where id::text like 'd0000000%';
update public.profiles set cargo = 'OPERACIONAL' where id = 'd0000000-0000-0000-0000-000000000001';
update public.profiles set cargo = 'GESTOR'      where id = 'd0000000-0000-0000-0000-000000000002';
update public.profiles set cargo = 'OPERADOR'    where id = 'd0000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- 1) Catalogo: a fonte da correcao, nao o sintoma
-- ---------------------------------------------------------------------------

-- O assert mais importante do arquivo. Sem ele, cada tabela nova volta a
-- nascer com escrita liberada e a 0031 vira manutencao perpetua.
select is(
  (select count(*)::int
     from pg_default_acl d
     join pg_namespace n on n.oid = d.defaclnamespace
     cross join lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'tabela nova criada por postgres nao nasce mais com escrita para anon/authenticated'
);

select ok(
  not has_table_privilege('authenticated', 'public.visitas', 'INSERT'),
  'authenticated nao insere visitas (escrita e da rota de importacao, com service_role)'
);

select ok(
  not has_table_privilege('authenticated', 'public.visitas', 'DELETE'),
  'authenticated nao apaga visitas'
);

select ok(
  not has_table_privilege('authenticated', 'public.leituras', 'UPDATE'),
  'authenticated nao altera leituras -- o registro de inspecao nao se reescreve pela sessao'
);

-- A tabela que concede escopo. Escrita nela e conceder acesso (0014), e ela
-- so tem policy de SELECT: o grant era a unica coisa fora do lugar.
select ok(
  not has_table_privilege('authenticated', 'public.grupos_sites_clientes', 'INSERT'),
  'authenticated nao se concede escopo de cliente'
);

select ok(
  not has_table_privilege('authenticated', 'public.metas_visitas', 'INSERT'),
  'authenticated nao escreve metas'
);

-- Achado 2: a escalada que sobrou de fora das 0002/0007.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated nao insere em profiles (INSERT alcancava cargo e ativo)'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated nao apaga perfis'
);

-- Contraste: a 0031 nao pode ter levado junto o unico grant que a 0007 deixou
-- de pe. Sem este assert, "revoguei tudo de profiles" passaria como correcao.
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'nome_completo', 'UPDATE'),
  'authenticated ainda edita o proprio nome_completo (grant da 0007 preservado)'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'cargo', 'UPDATE'),
  'cargo segue fora de qualquer grant de update (0002/0007)'
);

-- TRUNCATE e o unico privilegio deste arquivo que o RLS nao cobre: o Postgres
-- nao avalia policy nenhuma nele. Varredura, nao tabela a tabela.
select is(
  (select count(*)::int
     from pg_tables t
    where t.schemaname = 'public'
      and has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE')),
  0,
  'authenticated nao tem TRUNCATE em nenhuma tabela do schema public'
);

-- `anon` nao escreve em lugar nenhum. A 0010 fez isto para uma tabela; aqui e
-- a varredura que prova que nao sobrou nenhuma.
select is(
  (select count(*)::int
     from pg_tables t
     cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
    where t.schemaname = 'public'
      and has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), p.priv)),
  0,
  'anon nao tem nenhum privilegio de escrita em nenhuma tabela de public'
);

-- Achado 3: `revoke all from public` da 0026 nao removia o grant nominal que
-- o default privilege dava a `anon`.
select ok(
  not has_function_privilege(
    'anon',
    'public.sincronizar_membros_grupo_usuarios(bigint, uuid[])',
    'EXECUTE'
  ),
  'anon nao chama sincronizar_membros_grupo_usuarios via /rest/v1/rpc'
);

-- Contraste: quem a 0026 quis autorizar continua autorizado.
select ok(
  has_function_privilege(
    'authenticated',
    'public.sincronizar_membros_grupo_usuarios(bigint, uuid[])',
    'EXECUTE'
  ),
  'authenticated continua chamando sincronizar_membros_grupo_usuarios (0026 preservada)'
);

-- ---------------------------------------------------------------------------
-- 2) Comportamento: o lado que continua funcionando
--
-- E o que quebraria calado. A 0031 usa lista explicita de tabelas justamente
-- para nao levar junto os grants por coluna dos cinco cadastros.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.grupos_sites (nome) values ('Grupo pos-0031') $$,
  'OPERACIONAL continua criando grupo de sites (0009)'
);

select lives_ok(
  $$ insert into public.sites (grupo_site_id, nome)
     select id, 'Site pos-0031' from public.grupos_sites where nome = 'Grupo pos-0031' $$,
  'OPERACIONAL continua criando site (0012)'
);

select lives_ok(
  $$ insert into public.qr_codes (codigo, site_id)
     select 'QR-pos-0031', id from public.sites where nome = 'Site pos-0031' $$,
  'OPERACIONAL continua criando qr code (0015)'
);

select lives_ok(
  $$ update public.sites set sigla = 'PS31' where nome = 'Site pos-0031' $$,
  'OPERACIONAL continua editando site (0012)'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.grupos_usuarios (nome) values ('Grupo usuarios pos-0031') $$,
  'GESTOR continua criando grupo de usuarios (0016)'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3) Comportamento: o lado que passa a falhar por GRANT, nao por policy
--
-- A mensagem importa mais que o codigo aqui -- RLS por ausencia de policy
-- levanta o mesmo 42501. "permission denied" so aparece quando o grant nao
-- existe, que e o que a 0031 muda.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.visitas (numero_coleta, site_id) values (999001, 1) $$,
  '42501',
  'permission denied for table visitas',
  'OPERADOR ativo esbarra no GRANT ao forjar visita, nao mais so na ausencia de policy'
);

select throws_ok(
  $$ insert into public.profiles (id, email, cargo, ativo)
     values ('d0000000-0000-0000-0000-000000000009', 'forjado@teste.local', 'GESTOR', true) $$,
  '42501',
  'permission denied for table profiles',
  'authenticated nao cria perfil proprio com cargo GESTOR'
);

reset role;

select * from finish();

rollback;
