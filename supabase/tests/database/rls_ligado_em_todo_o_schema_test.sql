-- ============================================================================
-- pgTAP — invariante: toda tabela de `public` tem RLS ligado
--
-- Achado M-5 da auditoria AppSec de 2026-08-28.
--
-- POR QUE ESTE ARQUIVO EXISTE, sendo que hoje as 23 tabelas estao corretas:
-- os demais testes deste diretorio verificam as policies que EXISTEM. Nenhum
-- verifica a ausencia de RLS numa tabela que ainda nao foi escrita -- e e esse
-- o buraco.
--
-- A 0038 declarou, de proposito e com bom argumento, o default privilege
--
--     alter default privileges in schema public
--       grant select on tables to anon, authenticated;
--
-- que espelha o que a plataforma Supabase ja fazia em producao. O argumento de
-- la ("todas as policies sao `to authenticated`, entao o RLS ja nega qualquer
-- linha a um papel anonimo") esta certo para o estado atual, e continua certo.
-- O que ele nao cobre e o estado seguinte: o default privilege age no instante
-- em que a tabela e criada. Uma migration futura que crie tabela e esqueca
-- `alter table ... enable row level security` -- uma linha, e e o tipo de linha
-- que se esquece -- produz um objeto com SELECT concedido a `anon` e nenhuma
-- policy para recortar. Leitura publica para quem tiver a anon key, que esta
-- no bundle do painel e dentro do APK.
--
-- Nada pegaria isso: nao e erro de sintaxe, nao aparece em lint, o `tsc` passa
-- feliz e o `pnpm audit` nao tem opiniao sobre schema. Este assert pega, e
-- pega a tabela que ainda nao foi escrita -- por isso ele varre o catalogo em
-- vez de listar nome por nome. Listar nomes seria a mesma armadilha: uma
-- tabela nova nao entraria na lista, do mesmo jeito que nao entrou no
-- `enable row level security`.
--
-- `relkind = 'r'` restringe a tabelas comuns: view nao tem RLS proprio (herda
-- das tabelas de base) e tabela particionada seria coberta pelas particoes.
-- Nenhuma das duas existe em `public` hoje; a clausula esta ai para que a
-- primeira que aparecer nao quebre este teste por motivo errado.
-- ============================================================================

begin;

select plan(2);

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity $$,
  'toda tabela de public tem row level security ligado'
);

-- O complemento do assert acima. RLS ligado sem policy nenhuma nega tudo, o
-- que e seguro mas quase sempre e engano -- tabela criada, RLS ligado, e a
-- policy esquecida no meio do caminho. Falha aqui significa "decida se esta
-- tabela e mesmo inacessivel de propósito", nao "ha um vazamento".
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        ) $$,
  'toda tabela com RLS ligado tem ao menos uma policy'
);

select * from finish();

rollback;
