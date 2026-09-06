-- ============================================================================
-- pgTAP — `numero_coleta` como chave de idempotência do app (migration 0047)
--
-- O que a migration promete e este arquivo cobra:
--
--   1) A coluna virou `text` -- é o que permite as duas origens (o inteiro do
--      lote importado e o UUID cunhado pelo aparelho) conviverem na mesma
--      chave.
--   2) INSPETOR grava a própria visita com um UUID como `numero_coleta`.
--   3) Reenviar a MESMA visita (mesmo UUID, mesmo site) colide em
--      `visitas_numero_site_unico` -- é exatamente disto que a fila offline
--      depende para que sincronizar duas vezes não duplique a ronda.
--   4) Chave vazia é recusada pela check nova. `bigint` tornava isso
--      impossível; `text` admite, e duas visitas com `''` no mesmo site
--      colidiriam entre si.
--   5) O valor legado (número inteiro do sistema externo) continua cabendo --
--      a rota de importação não quebra.
--   6) Reenviar a MESMA leitura (mesma visita, área e instante) também colide
--      -- a segunda metade da prova do marco 03, e a razão de a sincronização
--      não precisar de lógica de conflito própria.
--
-- Ids de site/visita são capturados numa tabela temporária SEM RLS antes de
-- trocar de role, pelo mesmo motivo documentado em
-- `escrita_de_campo_por_inspetor_test.sql`: dentro de `authenticated`, um
-- `insert ... select ... from visitas` seria filtrado pela policy de SELECT
-- antes de o INSERT tentar, e o teste passaria pelo motivo errado.
--
-- Executado (2026-09-06) direto contra o projeto Supabase de produção, dentro
-- de uma transação com rollback, na MESMA transação da migration 0047 -- é o
-- ensaio que substitui o branch de desenvolvimento que o plano atual não tem.
-- 6/6 asserts passaram; nada persistiu (tipo da coluna conferido como `bigint`
-- de novo logo depois, e nenhuma linha de fixture sobrando).
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture: um INSPETOR ativo e um site mínimo para a visita ter onde pendurar.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.chave@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'b1000000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo Teste Chave');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Teste Chave' from public.grupos_sites where nome = 'Grupo Teste Chave';

insert into ids_teste (chave, valor)
  select 'site', id from public.sites where nome = 'Site Teste Chave';

-- ---------------------------------------------------------------------------
-- 1) O tipo da coluna.
-- ---------------------------------------------------------------------------
select is(
  (select data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'visitas' and column_name = 'numero_coleta'),
  'text',
  'numero_coleta e text -- cabe o inteiro do lote e o UUID do app'
);

-- ---------------------------------------------------------------------------
-- 2) INSPETOR grava a própria visita com UUID como chave.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "b1000000-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 'c9d1f2a4-1111-4222-8333-444455556666', s.id, 'b1000000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site Teste Chave';

select is(
  (select count(*)::int from public.visitas
     where numero_coleta = 'c9d1f2a4-1111-4222-8333-444455556666'),
  1,
  'INSPETOR grava a propria visita com UUID gerado pelo aparelho'
);

reset role;

insert into ids_teste (chave, valor)
  select 'visita', id from public.visitas
  where numero_coleta = 'c9d1f2a4-1111-4222-8333-444455556666';

-- ---------------------------------------------------------------------------
-- 3) Reenviar a mesma visita não cria uma segunda.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "b1000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('c9d1f2a4-1111-4222-8333-444455556666', %L, 'b1000000-0000-0000-0000-000000000001') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '23505',
  null,
  'reenviar a mesma visita colide na chave -- fila offline nao duplica ronda'
);

-- ---------------------------------------------------------------------------
-- 4) Chave vazia é recusada.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('   ', %L, 'b1000000-0000-0000-0000-000000000001') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  '23514',
  null,
  'chave vazia (ou so espaco) e recusada pela check'
);

-- ---------------------------------------------------------------------------
-- 5) O valor legado do lote importado continua cabendo.
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('907152', %L, 'b1000000-0000-0000-0000-000000000001') $$,
    (select valor from ids_teste where chave = 'site')
  ),
  'numero inteiro do sistema externo continua cabendo na coluna'
);

-- ---------------------------------------------------------------------------
-- 6) Reenviar a mesma leitura não cria uma segunda.
-- ---------------------------------------------------------------------------
insert into public.leituras (visita_id, data_hora)
  select valor, '2026-09-06T09:15:00-03:00'::timestamptz from ids_teste where chave = 'visita';

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora)
       values (%L, '2026-09-06T09:15:00-03:00'::timestamptz) $$,
    (select valor from ids_teste where chave = 'visita')
  ),
  '23505',
  null,
  'reenviar a mesma leitura colide -- sync nao precisa de logica de conflito propria'
);

reset role;

select * from finish();

rollback;
