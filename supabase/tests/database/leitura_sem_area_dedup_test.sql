-- ============================================================================
-- pgTAP — leitura sem area entra na deduplicacao
--
-- Cobre a migration 0017: antes dela, indice unico comum nao considera dois
-- NULL iguais, entao duas leituras da mesma visita, no mesmo instante, sem
-- `area_id`, nao colidiam -- um reenvio do mesmo lote duplicava a leitura em
-- vez de ser ignorado (ver docs/importacao-de-coletas.md). `nulls not
-- distinct` fecha o buraco.
--
-- Executado (2026-08-11) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual. 3/3 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(3);

insert into public.grupos_sites (nome) values ('Grupo do teste de dedup');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site do teste de dedup' from public.grupos_sites where nome = 'Grupo do teste de dedup';
insert into public.visitas (numero_coleta, site_id)
  select 1, id from public.sites where nome = 'Site do teste de dedup';

insert into public.leituras (visita_id, area_id, data_hora)
  select id, null, '2026-08-06T10:00:00-03:00'
  from public.visitas
  where numero_coleta = 1;

select throws_ok(
  $$
    insert into public.leituras (visita_id, area_id, data_hora)
    select id, null, '2026-08-06T10:00:00-03:00'
    from public.visitas
    where numero_coleta = 1
  $$,
  '23505',
  null,
  'leitura sem area repetida no mesmo instante colide (nulls not distinct, migration 0017)'
);

select lives_ok(
  $$
    insert into public.leituras (visita_id, area_id, data_hora)
    select id, null, '2026-08-06T11:00:00-03:00'
    from public.visitas
    where numero_coleta = 1
  $$,
  'leitura sem area em instante diferente continua permitida'
);

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id where v.numero_coleta = 1),
  2,
  'apenas as duas leituras distintas foram gravadas'
);

select * from finish();

rollback;
