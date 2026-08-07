-- ============================================================================
-- VeloxLab — Presença de localização na leitura
--
-- A 0022 removeu `leituras.latitude/longitude` e levou junto o filtro
-- "Com Localização" / "Sem Localização", porque ele era literalmente
-- `latitude is not null`.
--
-- Mas o filtro nunca mostrou coordenada nenhuma: ele só oferece "Com" e "Sem".
-- O que ele precisa saber é se o aparelho obteve sinal -- um booleano, não um
-- par de números. Guardar a flag devolve o filtro sem devolver o dado que se
-- decidiu não guardar.
--
-- `not null default false`: a ausência de sinal é o caso conservador. Uma
-- leitura antiga sem essa informação não deve aparecer como "Com Localização",
-- porque isso afirmaria algo que ninguém registrou.
--
-- A rota de importação passa a derivar isto de `latitude`/`longitude` do lote:
-- os campos continuam sendo ACEITOS (0022), e agora, em vez de simplesmente
-- descartados, viram esta flag. Quem envia os lotes segue sem mudar nada.
--
-- Índice parcial, como o `leituras_com_localizacao_idx` que a 0004 tinha e a
-- 0022 removeu: o filtro procura pela presença, e `leituras` é a tabela que
-- mais cresce aqui.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

alter table public.leituras
  add column if not exists tem_localizacao boolean not null default false;

comment on column public.leituras.tem_localizacao is
  'O aparelho obteve sinal ao registrar a leitura. Substitui a checagem
   `latitude is not null` que existia antes da 0022 -- a coordenada em si nao
   e mais guardada.';

create index if not exists leituras_com_localizacao_idx on public.leituras (id)
  where tem_localizacao;
