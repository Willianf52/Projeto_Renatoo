-- ============================================================================
-- pgTAP -- limite de taxa compartilhado (migration 0048)
--
-- Tres blocos, na ordem de gravidade:
--
--   1) Quem NAO chega: anon e authenticated nao leem a tabela nem executam a
--      funcao. E o bloco que mais importa -- aberto, o limitador vira
--      ferramenta de negacao de servico na mao de quem tem a anon key.
--   2) O que a service_role faz: conta, recusa acima do limite com o
--      Retry-After certo, separa chaves e reabre a janela vencida.
--   3) O que quebraria calado: chave que nao e hash (IP cru gravado) e limite
--      invalido.
--
-- Executado pelo job `banco` da CI (Postgres local), dentro de transacao com
-- rollback. Nao ha execucao contra producao registrada.
-- ============================================================================

begin;

select plan(14);

-- 1) Quem nao chega -----------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select 1 from public.limites_de_taxa $$,
  '42501', null,
  'anon nao le limites_de_taxa'
);

select throws_ok(
  $$ select public.consumir_limite_de_taxa(repeat('a', 64), 10, 60000) $$,
  '42501', null,
  'anon nao executa consumir_limite_de_taxa (esgotaria o balde dos outros)'
);

reset role;
set local role authenticated;

select throws_ok(
  $$ select 1 from public.limites_de_taxa $$,
  '42501', null,
  'authenticated nao le limites_de_taxa'
);

select throws_ok(
  $$ select public.consumir_limite_de_taxa(repeat('a', 64), 10, 60000) $$,
  '42501', null,
  'authenticated nao executa consumir_limite_de_taxa'
);

reset role;

-- 2) O que a service_role faz --------------------------------------------------

set local role service_role;

select is(
  public.consumir_limite_de_taxa(repeat('a', 64), 2, 60000), 0,
  '1a requisicao dentro do limite: permitida'
);

select is(
  public.consumir_limite_de_taxa(repeat('a', 64), 2, 60000), 0,
  '2a requisicao, no limite exato: permitida'
);

select cmp_ok(
  public.consumir_limite_de_taxa(repeat('a', 64), 2, 60000), '>', 0,
  '3a requisicao, acima do limite: recusada'
);

select cmp_ok(
  public.consumir_limite_de_taxa(repeat('a', 64), 2, 60000), '<=', 60,
  'Retry-After nunca passa da janela (60s)'
);

select is(
  (select contagem from public.limites_de_taxa where chave = repeat('a', 64)), 4,
  'as quatro chamadas somaram no MESMO balde'
);

select is(
  public.consumir_limite_de_taxa(repeat('b', 64), 2, 60000), 0,
  'outra chave tem balde proprio: nao herda a recusa da primeira'
);

-- Janela vencida: simulada movendo o fim para o passado, em vez de esperar.
update public.limites_de_taxa
   set expira_em = clock_timestamp() - interval '1 second'
 where chave = repeat('a', 64);

select is(
  public.consumir_limite_de_taxa(repeat('a', 64), 2, 60000), 0,
  'janela vencida reabre: a requisicao seguinte e permitida'
);

select is(
  (select contagem from public.limites_de_taxa where chave = repeat('a', 64)), 1,
  'janela vencida recomeca a contagem do 1, nao continua a anterior'
);

-- 3) O que quebraria calado -----------------------------------------------------

select throws_ok(
  $$ select public.consumir_limite_de_taxa('importar-coletas:203.0.113.9', 10, 60000) $$,
  '23514', null,
  'chave que nao e sha256 hex e recusada -- IP cru nao entra na tabela'
);

select throws_ok(
  $$ select public.consumir_limite_de_taxa(repeat('c', 64), 0, 60000) $$,
  '22023', null,
  'limite zero e recusado, em vez de recusar toda requisicao em silencio'
);

reset role;

select * from finish();

rollback;
