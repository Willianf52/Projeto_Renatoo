-- ============================================================================
-- pgTAP — o bucket `checklists` so aceita imagem, e com teto de tamanho
--
-- Achado da revisao de seguranca de 2026-09-04, fechado pela 0046.
--
-- POR QUE ESTE ARQUIVO EXISTE: os testes de midia que ja havia
-- (`midia_do_checklist_amarrada_a_visita_test.sql`) cobrem QUEM grava ONDE --
-- as policies da 0042/0045. Nenhum cobria O QUE. O bucket nasceu na 0042 com
-- `file_size_limit` e `allowed_mime_types` nulos, que no Storage significa
-- "qualquer tamanho, qualquer tipo", e isso nao aparece em lint, em `tsc` nem
-- no advisor: e uma coluna nula, nao um erro.
--
-- O assert e sobre configuracao e nao sobre comportamento porque o Storage
-- aplica os dois campos na sua propria camada (API), fora do Postgres -- nao
-- da para exercitar um upload daqui. O que da, e o que importa para nao
-- regredir, e travar a configuracao: uma migration futura que recrie o bucket
-- com `on conflict do update set public = false` (exatamente o que a 0042 faz)
-- zeraria estes dois campos de novo sem que nada reclamasse.
-- ============================================================================

begin;

select plan(4);

select is(
  (select public from storage.buckets where id = 'checklists'),
  false,
  'o bucket de midia do checklist e privado'
);

select is(
  (select file_size_limit from storage.buckets where id = 'checklists'),
  10485760::bigint,
  'o bucket de midia do checklist tem teto de 10 MiB por arquivo'
);

-- Ordenado antes de comparar: a igualdade de array respeita a ordem, e a
-- ordem em que os tipos foram escritos na migration nao e parte da regra.
select is(
  (
    select array(
      select unnest(allowed_mime_types)
        from storage.buckets
       where id = 'checklists'
       order by 1
    )
  ),
  array['image/jpeg', 'image/png'],
  'o bucket de midia do checklist aceita exatamente PNG e JPEG'
);

-- O complemento explicito do assert acima, porque este e o erro que alguem
-- cometeria de boa-fe ao "adicionar mais um formato de imagem": SVG e XML e
-- carrega <script>, entao serve-lo do origin do Storage por URL assinada
-- reabre o caminho que a 0046 fechou.
-- `@>` (contem) e nao `= any(...)`: com uma subconsulta entre parenteses, o
-- `any` casa com a forma de SUBCONSULTA do operador, nao com a de array, e o
-- Postgres tenta ler 'image/svg+xml' como literal de array ("malformed array
-- literal"). O operador de contencao compara text[] com text[] e nao tem essa
-- ambiguidade.
select ok(
  not (
    (select allowed_mime_types from storage.buckets where id = 'checklists')
    @> array['image/svg+xml']
  ),
  'o bucket de midia do checklist nao aceita SVG'
);

select * from finish();

rollback;
