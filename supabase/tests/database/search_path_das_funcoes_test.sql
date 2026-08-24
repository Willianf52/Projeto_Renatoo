-- ============================================================================
-- pgTAP — `search_path` das funcoes de `public` (migration 0041)
--
-- Este arquivo nao testa uma funcao: testa uma INVARIANTE do schema. Por isso
-- todos os asserts sao varredura de catalogo com resultado esperado zero, e
-- nao verificacao nome a nome.
--
-- A diferenca importa. Um teste que listasse as 13 funcoes de hoje passaria
-- verde na semana que vem, com uma funcao nova sem `pg_temp` -- que e
-- justamente o caso que este arquivo existe para pegar. Contar as que
-- DESCUMPREM a regra cobre o que ainda nem foi escrito.
--
-- A regra: toda funcao de `public` declara `search_path` terminando em
-- `pg_temp`. O Postgres pesquisa o schema temporario antes do search_path
-- explicito quando `pg_temp` nao esta na lista, e `authenticated` tem
-- privilegio TEMP neste banco -- entao um objeto temporario poderia sombrear
-- uma tabela de verdade dentro de uma funcao `security definer`, que roda com
-- os privilegios do dono.
-- ============================================================================

begin;

select plan(4);

-- ---------------------------------------------------------------------------
-- 1) Nenhuma funcao sem `search_path` nenhum
--
-- Pior que `pg_temp` faltando: sem declaracao, a funcao herda o search_path
-- de QUEM CHAMA, e ai nem `public` esta garantido.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path'),
  0,
  'toda funcao de public declara search_path'
);

-- ---------------------------------------------------------------------------
-- 2) Nenhuma funcao sem `pg_temp` na lista
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') !~ 'pg_temp'),
  0,
  'toda funcao de public tem pg_temp no search_path'
);

-- ---------------------------------------------------------------------------
-- 3) `pg_temp` por ULTIMO
--
-- O assert que impede a correcao errada. `search_path = pg_temp, public` tem
-- pg_temp na lista e passaria no assert 2 -- e seria PIOR que nao declarar,
-- porque poe o schema temporario explicitamente na frente. A posicao e o que
-- faz a mitigacao valer.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') !~ 'pg_temp\s*$'),
  0,
  'pg_temp e o ULTIMO item do search_path, nao o primeiro'
);

-- ---------------------------------------------------------------------------
-- 4) Contraste: a varredura acima esta mesmo olhando alguma coisa
--
-- Sem este assert, um `where` errado que nao casasse com funcao nenhuma
-- deixaria os tres primeiros verdes por vacuidade. Treze e o numero de hoje;
-- o assert e `>= 12` para nao quebrar a cada funcao nova, mas alto o
-- suficiente para provar que a varredura tem alcance real.
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'),
  '>=',
  12,
  'a varredura alcanca as funcoes de public (nao passa por vacuidade)'
);

select * from finish();

rollback;
