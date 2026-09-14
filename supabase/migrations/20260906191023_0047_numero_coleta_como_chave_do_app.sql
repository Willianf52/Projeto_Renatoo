-- ============================================================================
-- VeloxLab — `numero_coleta` deixa de ser contador de terceiro e vira chave
-- de idempotência gerada pelo app
--
-- O PROBLEMA QUE A AUSÊNCIA CAUSA -- até aqui, todo dado de campo entrava
-- pela rota de importação em lote, e `numero_coleta` era confiado porque
-- "vinha do dispositivo" de um sistema externo que o inventava. O app de
-- campo (plano "Abrindo o Portão", marco 03) muda a origem: quem cria a
-- visita passa a ser o nosso aparelho, offline, antes de qualquer contato
-- com o banco. Um aparelho sem rede não tem como pedir o próximo número de
-- um contador -- dois inspetores no mesmo site chegariam ao mesmo inteiro e
-- a segunda sincronização colidiria com a primeira em
-- `visitas_numero_site_unico`, descartando uma ronda real como se fosse
-- reenvio. A chave que a fila offline precisa é uma que o próprio
-- dispositivo consiga cunhar sozinho, sem coordenar com ninguém: um UUID,
-- criado no instante da primeira leitura.
--
-- POR QUE `text` E NÃO `uuid` -- a rota de importação continua de pé e
-- continua recebendo inteiro positivo do sistema de origem (ver
-- `apps/web/src/lib/importar-coletas.ts`); um `uuid` não acomodaria esse
-- valor, e migrar as duas origens de uma vez trocaria um problema por dois.
-- Com `text`, a mesma coluna e a MESMA constraint servem às duas origens: o
-- lote grava o número que o sistema externo inventou, o app grava o UUID que
-- ele mesmo gerou. O upsert de reenvio -- o mecanismo que a sincronização
-- offline reaproveita inteiro -- não muda de forma.
--
-- A CONSTRAINT NÃO MUDA, DE PROPÓSITO -- `unique (numero_coleta, site_id)`
-- é justamente o que faz reenviar a mesma visita duas vezes não duplicar.
-- Ela é recriada sozinha pelo `alter type`; o que este arquivo acrescenta é
-- só recusar string vazia, valor que o tipo `bigint` tornava impossível e o
-- `text` passa a admitir. Chave vazia não é chave: duas visitas diferentes
-- com `''` no mesmo site colidiriam entre si e a terceira ronda do dia
-- sumiria em silêncio.
--
-- Forward-only, como toda mudança de schema deste projeto. Reverter para
-- `bigint` só seria possível enquanto nenhuma linha tiver UUID -- depois do
-- primeiro sync do app, não é mais uma opção.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Tipo da coluna ----------------------------------------------------------
-- Sob `if` porque `alter column ... type` reescreve a tabela toda vez, mesmo
-- quando o tipo já é o desejado -- em produção isso é I/O à toa e um
-- `access exclusive lock` desnecessário numa tabela que o portal consulta.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visitas'
      and column_name = 'numero_coleta'
      and data_type <> 'text'
  ) then
    alter table public.visitas
      alter column numero_coleta type text using numero_coleta::text;
  end if;
end;
$$;

comment on column public.visitas.numero_coleta is
  'Chave de idempotencia da visita, unica por site. Duas origens convivem
   nela: o lote importado grava o numero inteiro que o sistema externo
   inventou, e o app de campo grava um UUID que ele mesmo gera na primeira
   leitura offline -- sem rede nao ha contador para consultar. E o que faz
   reenviar a mesma ronda duas vezes nao duplicar.';

-- 2) Chave vazia não é chave -------------------------------------------------
-- `drop`/`add` em vez de `add ... if not exists` (que o Postgres não tem para
-- check): a definição deste arquivo é a que vale, mesmo num banco onde uma
-- versão anterior já rodou. Mesmo padrão da 0003/0019/0036.

alter table public.visitas
  drop constraint if exists visitas_numero_coleta_nao_vazio;

alter table public.visitas
  add constraint visitas_numero_coleta_nao_vazio
  check (length(btrim(numero_coleta)) > 0);
