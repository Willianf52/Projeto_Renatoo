-- ============================================================================
-- pgTAP — funcoes de RLS fora do schema exposto pela API (migration 0050)
--
-- Reproduz o advisor `0029_authenticated_security_definer_function_executable`
-- como varredura de catalogo: zero funcao `security definer` em `public`
-- executavel por `authenticated`. Varredura, e nao lista de nomes, pelo mesmo
-- motivo de `search_path_das_funcoes_test.sql`: pega a funcao que ainda nem
-- foi escrita.
--
-- E o lado que nao pode quebrar: as policies continuam avaliando (agora pela
-- funcao em `autorizacao`), e os quatro envelopes que o painel chama por RPC
-- seguem chamaveis por `authenticated` e fechados para `anon`.
-- ============================================================================

begin;

select plan(9);

-- ---------------------------------------------------------------------------
-- 1) O achado do advisor
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'nenhuma funcao security definer de public e executavel por authenticated'
);

-- As seis sem envelope sairam de `public` de fato.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('usuario_ativo', 'nivel_acesso_atual', 'e_cliente',
                        'e_inspetor', 'pode_ver_grupo_site', 'pode_ver_visita')),
  0,
  'as seis auxiliares sem uso por RPC nao existem mais em public'
);

-- Contraste: as dez estao em `autorizacao`, ainda security definer.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'autorizacao' and p.prosecdef),
  10,
  'as dez auxiliares estao em autorizacao como security definer'
);

-- ---------------------------------------------------------------------------
-- 2) Os envelopes do painel
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and p.proname in ('pode_administrar_cadastros', 'pode_administrar_usuarios',
                        'pode_administrar_grupos_usuarios', 'pode_ver_toda_operacao')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  4,
  'os quatro envelopes de public sao invoker e chamaveis por authenticated'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'autorizacao')
      and p.proname in ('pode_administrar_cadastros', 'pode_administrar_usuarios',
                        'pode_administrar_grupos_usuarios', 'pode_ver_toda_operacao')
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon nao executa envelope nem auxiliar (0027 preservada)'
);

-- ---------------------------------------------------------------------------
-- 3) As policies seguem apontando para as auxiliares
--
-- `pg_policies` reconstroi a expressao a partir do OID; fora do search_path,
-- a funcao aparece qualificada. Se a policy tivesse ficado presa a um nome,
-- nao haveria nenhuma com `autorizacao.` aqui.
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*)::int
     from pg_policies
    where coalesce(qual, '') || coalesce(with_check, '') ~ 'autorizacao\.'),
  '>=',
  20,
  'as policies referenciam as funcoes de autorizacao'
);

-- ---------------------------------------------------------------------------
-- 4) Comportamento: policy avaliada por authenticated nao esbarra no schema
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0050@teste.local'),
  ('f5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.0050@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'f5000000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'OPERADOR'
  where id = 'f5000000-0000-0000-0000-000000000002';

-- OPERADOR le so a propria linha de `profiles` (policy da 0006, que chama
-- `pode_ver_toda_operacao()` e `usuario_ativo()`). Sem USAGE no schema
-- novo, isto viraria "permission denied for schema autorizacao".
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f5000000-0000-0000-0000-000000000002", "role": "authenticated"}';
select is(
  (select count(*)::int from public.profiles
    where id in ('f5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002')),
  1,
  'OPERADOR le so o proprio perfil, com a policy passando por autorizacao'
);
select is(public.pode_ver_toda_operacao(), false, 'envelope responde pelo chamador: OPERADOR nao ve a operacao');
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f5000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(public.pode_ver_toda_operacao(), true, 'envelope responde pelo chamador: GESTOR ve a operacao');
reset role;

select * from finish();

rollback;
