-- ============================================================================
-- pgTAP — blindagem de `profiles` e grants excedentes (migration 0039)
--
-- Cobre os tres ajustes da 0039, e o metodo importa em cada um:
--
--   1) TRIGGER DE CARGO/ATIVO. Testar isto com o grant por coluna da 0007 no
--      lugar nao provaria nada: a escrita morreria no GRANT, antes de o
--      trigger existir na historia. Entao a secao 2 REMOVE a primeira camada
--      dentro da transacao (`grant update on profiles to authenticated`) e so
--      depois exercita o trigger. E a unica forma de provar que a segunda
--      camada segura sozinha -- que e a razao de ela existir.
--
--      Os asserts 1 e 2 confirmam antes que a primeira camada esta intacta no
--      estado normal; sem eles, um revoke acidental da 0007 passaria batido e
--      o teste continuaria verde pelo motivo errado.
--
--   2) AUDITORIA. O risco aqui nao e falta de linha, e linha DUPLICADA: a
--      rota de usuarios ja grava em `auditoria` explicitamente (ver o
--      cabecalho de `cadastros/usuarios/actions.ts`). Por isso ha um assert
--      para "escrita de sessao gera linha" e outro, igualmente importante,
--      para "escrita sem sessao NAO gera linha".
--
--   3) GRANTS. Varredura de catalogo, e com o contraste: as duas tabelas que
--      TEM policy de DELETE precisam continuar com o grant, senao a tela de
--      grupos de usuarios quebra em silencio.
--
-- Tudo dentro de begin/rollback: nada persiste.
-- ============================================================================

begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixture: um OPERADOR ativo e um GESTOR ativo.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.blindagem@teste.local'),
  ('a2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.blindagem@teste.local');

update public.profiles set ativo = true, cargo = 'OPERADOR', nome_completo = 'Operador Um'
  where id = 'a1111111-1111-1111-1111-111111111111';
update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'a2222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------------
-- 1) A primeira camada continua no lugar (grant por coluna, 0007)
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'cargo', 'UPDATE'),
  'cargo segue fora do grant de update de authenticated (0007)'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'ativo', 'UPDATE'),
  'ativo segue fora do grant de update de authenticated (0007)'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'nome_completo', 'UPDATE'),
  'nome_completo continua editavel -- a 0039 nao pode ter fechado demais'
);

-- O trigger existe e roda antes da linha, que e o unico momento em que da
-- para comparar OLD com NEW.
select is(
  (select count(*)::int
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where c.relname = 'profiles'
      and t.tgname = 'impedir_escalacao_trigger'
      and not t.tgisinternal
      and t.tgtype::int & 2 = 2),
  1,
  'impedir_escalacao_trigger existe em profiles como BEFORE'
);

-- ---------------------------------------------------------------------------
-- 2) A segunda camada, com a primeira removida de proposito
--
-- Este grant e o cenario que a 0039 existe para sobreviver: alguem amplia o
-- update de `profiles` sem perceber o que isso abre. Some no rollback.
-- ---------------------------------------------------------------------------
grant update on public.profiles to authenticated;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$ update public.profiles set cargo = 'GESTOR' where id = 'a1111111-1111-1111-1111-111111111111' $$,
  '42501',
  'Alteracao de cargo nao e permitida pelo token da sessao.',
  'OPERADOR nao se promove a GESTOR nem com o grant de coluna aberto'
);

select throws_ok(
  $$ update public.profiles set ativo = false where id = 'a1111111-1111-1111-1111-111111111111' $$,
  '42501',
  'Alteracao de status ativo nao e permitida pelo token da sessao.',
  'OPERADOR nao mexe no proprio status ativo'
);

-- Contraste que impede a correcao errada: bloquear cargo/ativo nao pode ter
-- levado junto a edicao legitima do proprio nome.
select lives_ok(
  $$ update public.profiles set nome_completo = 'Operador Renomeado' where id = 'a1111111-1111-1111-1111-111111111111' $$,
  'o usuario continua editando o proprio nome_completo'
);

-- O trigger compara OLD com NEW, nao "a coluna apareceu no SET": reescrever o
-- mesmo valor nao e mudanca e nao pode ser recusado.
select lives_ok(
  $$ update public.profiles set cargo = 'OPERADOR' where id = 'a1111111-1111-1111-1111-111111111111' $$,
  'gravar o MESMO cargo passa -- o trigger olha diferenca, nao presenca'
);

reset role;

-- GESTOR ativo e a excecao explicita da 0039.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Na PROPRIA linha: a policy de UPDATE de profiles e `auth.uid() = id`, entao
-- nem um GESTOR alcanca a linha de outro pelo token da sessao -- o RLS barra
-- antes de o trigger opinar. A excecao de admin so e observavel aqui.
select lives_ok(
  $$ update public.profiles set cargo = 'SUPERVISOR' where id = 'a2222222-2222-2222-2222-222222222222' $$,
  'GESTOR ativo altera o proprio cargo -- excecao de pode_administrar_usuarios()'
);

reset role;
-- `reset role` NAO limpa o claim: sem zerar, `auth.uid()` continuaria
-- devolvendo o GESTOR e o trigger de auditoria dispararia na escrita abaixo,
-- que o teste trata como "sem sessao".
set local "request.jwt.claims" to '{}';

-- Sem sessao (o caminho real do painel, via service_role) nada e barrado.
select lives_ok(
  $$ update public.profiles set cargo = 'OPERACIONAL', ativo = false where id = 'a1111111-1111-1111-1111-111111111111' $$,
  'escrita sem token de sessao passa -- a rota de usuarios continua funcionando'
);

-- ---------------------------------------------------------------------------
-- 3) Trilha de auditoria: cobre a sessao sem duplicar a rota
-- ---------------------------------------------------------------------------
-- A secao 2 fez escritas de sessao que deram certo (`nome_completo`, e o
-- cargo reescrito com o mesmo valor), e o trigger auditou cada uma -- que e
-- justamente o comportamento sob teste. Zerar aqui deixa os dois asserts
-- abaixo medindo so a escrita que cada um quer medir, em vez de herdar
-- contagem da secao anterior.
--
-- Nota de comportamento: reescrever o mesmo valor gera linha de auditoria. O
-- Postgres reescreve a tupla e dispara o AFTER de qualquer jeito; a trilha
-- registra a operacao, nao o diff.
delete from public.auditoria where tabela = 'profiles';

update public.profiles set ativo = true where id = 'a1111111-1111-1111-1111-111111111111';

-- Linha de base sem sessao: `auth.uid()` e null, a clausula `when` do trigger
-- e falsa, e nada e gravado. E isto que evita a linha duplicada em toda
-- edicao feita pelo painel.
select is(
  (select count(*)::int from public.auditoria
    where tabela = 'profiles' and registro_id = 'a1111111-1111-1111-1111-111111111111'),
  0,
  'escrita sem sessao NAO gera linha de auditoria (a rota grava a dela)'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1111111-1111-1111-1111-111111111111", "role": "authenticated"}';

update public.profiles set nome_completo = 'Operador Auditado'
  where id = 'a1111111-1111-1111-1111-111111111111';

reset role;
set local "request.jwt.claims" to '{}';

select is(
  (select count(*)::int from public.auditoria
    where tabela = 'profiles'
      and registro_id = 'a1111111-1111-1111-1111-111111111111'
      and operacao = 'UPDATE'),
  1,
  'edicao pelo token da sessao gera exatamente uma linha em auditoria'
);

select is(
  (select ator_id from public.auditoria
    where tabela = 'profiles' and registro_id = 'a1111111-1111-1111-1111-111111111111'
    order by id desc limit 1),
  'a1111111-1111-1111-1111-111111111111'::uuid,
  'a linha traz o ator de verdade, nao null'
);

-- ---------------------------------------------------------------------------
-- 4) Grants DELETE excedentes
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from (values ('sites'), ('grupos_sites'), ('qr_codes')) as t(tabela)
    where has_table_privilege('authenticated', format('public.%I', t.tabela), 'DELETE')),
  0,
  'authenticated perdeu DELETE em sites, grupos_sites e qr_codes'
);

-- O contraste: estas duas TEM policy de DELETE e a tela depende delas. Um
-- revoke largo demais quebraria a remocao de membros sem erro nesta suite se
-- ela so olhasse o lado negativo.
select is(
  (select count(*)::int
     from (values ('grupos_usuarios'), ('grupos_usuarios_membros')) as t(tabela)
    where has_table_privilege('authenticated', format('public.%I', t.tabela), 'DELETE')),
  2,
  'grupos_usuarios e grupos_usuarios_membros mantem DELETE -- tem policy'
);

select * from finish();

rollback;
