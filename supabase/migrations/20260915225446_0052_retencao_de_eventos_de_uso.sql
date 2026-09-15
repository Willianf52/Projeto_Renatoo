-- ============================================================================
-- VeloxLab — expurgo de eventos de uso depois de 12 meses (P2-4)
--
-- A 0051 criou `eventos_de_uso` e deixou a retencao explicitamente em aberto:
-- "sem expurgo nesta migration. O prazo entra na secao de retencao do
-- `docs/lgpd-privacidade.md`". Esta migration fecha essa ponta.
--
-- DECISAO (15/09/2026, dono do produto): **12 meses**. E o numero que o
-- proprio `docs/lgpd-privacidade.md` sugeria para dado de uso -- cobre a
-- comparacao de um setembro contra o outro, que num sistema de rondas mensais
-- e a pergunta que a telemetria existe para responder, e e curto o bastante
-- para nao virar achado em auditoria de LGPD. A retencao de `leituras` e
-- `visitas` continua em aberto: sao dado de OPERACAO, com contestacao de
-- cliente e obrigacao contratual no meio, e nao se decidem pelo mesmo
-- argumento.
--
-- POR QUE UM SCHEMA NOVO, E NAO UMA FUNCAO EM `public`:
--
--   - `public` e o schema que o PostgREST expoe e que `database.types.ts`
--     espelha. Uma rotina de manutencao nao tem por que aparecer na API nem
--     no tipo gerado -- e a 0050 acabou de gastar uma migration inteira
--     tirando de `public` o que nao precisava estar la.
--   - `manutencao` nasce sem USAGE para `anon`/`authenticated`: mesmo que um
--     grant futuro escape, ninguem alcanca a funcao pela API.
--
-- POR QUE FUNCAO, E NAO O `delete` escrito direto no agendamento: a regra de
-- retencao passa a ter um nome, um lugar e um pgTAP. O agendamento vira
-- detalhe de como ela e disparada -- e, se o pg_cron faltar, o prazo continua
-- definido e executavel a mao.
--
-- AGENDAMENTO: pg_cron, que ja vem pre-carregado no Postgres do Supabase
-- (conferido em producao em 15/09: `shared_preload_libraries` inclui
-- `pg_cron`, extensao ainda nao criada). O bloco e defensivo de proposito: o
-- Postgres do stack local da CI pode nao ter a extensao disponivel, e uma
-- migration que quebra o job `banco` por causa de um agendamento seria o
-- pior dos dois mundos. Sem pg_cron, a migration avisa e segue -- a tabela
-- nao cresce a ponto de um dia de atraso importar.
--
-- HORARIO: 06:30 UTC (03:30 de Brasilia), meia hora depois do backup diario
-- das 06:00 UTC, para o backup do dia guardar o estado ANTES do expurgo.
-- ============================================================================

create schema if not exists manutencao;

revoke all on schema manutencao from public;
grant usage on schema manutencao to service_role;

comment on schema manutencao is
  'Rotinas de manutencao do banco (expurgo por retencao). Fora da API de proposito -- ver migration 0052.';

-- ---------------------------------------------------------------------------
-- A regra de retencao
--
-- `security definer` porque quem executa e o agendador (pg_cron roda como o
-- dono do banco) e, no ensaio, um teste: nenhum dos dois deve depender de
-- grant de DELETE na tabela. Devolve quantas linhas foram apagadas, para o
-- resultado aparecer no historico do pg_cron em vez de sumir.
-- ---------------------------------------------------------------------------
create or replace function manutencao.expurgar_eventos_de_uso(
  prazo interval default interval '12 months'
)
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  apagadas integer;
begin
  delete from public.eventos_de_uso where criado_em < now() - prazo;
  get diagnostics apagadas = row_count;
  return apagadas;
end;
$$;

comment on function manutencao.expurgar_eventos_de_uso(interval) is
  'Apaga telemetria de uso mais velha que o prazo (padrao: 12 meses). Decisao de 15/09/2026, registrada em docs/lgpd-privacidade.md.';

revoke all on function manutencao.expurgar_eventos_de_uso(interval) from public, anon, authenticated;
grant execute on function manutencao.expurgar_eventos_de_uso(interval) to service_role;

-- ---------------------------------------------------------------------------
-- Agendamento diario, quando o pg_cron existir
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Idempotente: reaplicar a migration nao cria um segundo agendamento.
    perform cron.unschedule('expurgar-eventos-de-uso')
      where exists (select 1 from cron.job where jobname = 'expurgar-eventos-de-uso');

    perform cron.schedule(
      'expurgar-eventos-de-uso',
      '30 6 * * *',
      $cron$select manutencao.expurgar_eventos_de_uso()$cron$
    );

    raise notice 'expurgo de eventos_de_uso agendado no pg_cron (06:30 UTC)';
  else
    raise notice 'pg_cron indisponivel neste servidor: expurgo de eventos_de_uso NAO agendado (a funcao existe e pode ser chamada a mao)';
  end if;
exception
  when insufficient_privilege or feature_not_supported then
    raise notice 'pg_cron presente mas indisponivel para este papel: expurgo NAO agendado (%)', sqlerrm;
end;
$$;
