-- ============================================================================
-- VeloxLab — Resumo do dashboard
--
-- `/dashboard` nao tinha tela propria: redirecionava para a listagem de
-- coletas. E `metas_visitas` existia desde a 0004, com policy de leitura, sem
-- nada nunca a consultar -- a propria migration cita o grafico "Visitas
-- Realizadas x Nao Realizadas" que ela alimentaria.
--
-- As duas views abaixo fazem a agregacao no banco em vez de no TS. Contar
-- visitas por site no mes a partir do PostgREST exigiria trazer as linhas para
-- contar em memoria, que e a mesma armadilha que `coletas-importadas`
-- documenta ao usar `count=estimated` em vez de paginar ids.
--
-- `security_invoker = true` em ambas: sem isso, uma view roda com as
-- permissoes de quem a criou e **contorna o RLS inteiro** -- um CLIENTE veria
-- pelo dashboard o que a 0014 acabou de fechar nas tabelas. Com o invoker, as
-- policies de `visitas`, `leituras` e `metas_visitas` continuam valendo linha
-- a linha.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Mes corrente no fuso da operacao ----------------------------------------
/**
 * Inicio do mes corrente, em Brasilia, como timestamptz.
 *
 * O deslocamento vai fixo em -03:00 pela mesma razao documentada em
 * `combinarDataHora` (coletas-importadas/queries.ts): o Brasil nao observa
 * horario de verao desde 2019, entao o deslocamento nao varia ao longo do ano.
 * Sem fuso explicito, `date_trunc` usaria o fuso da conexao -- e o mes do
 * dashboard mudaria conforme quem consulta, sem erro nenhum aparecendo.
 *
 * O vai-e-volta de `at time zone` nao e redundante: o primeiro converte
 * timestamptz -> timestamp local, para o `date_trunc` cortar no mes certo; o
 * segundo converte timestamp local -> timestamptz, para o resultado poder ser
 * comparado com as colunas.
 */
create or replace function public.inicio_do_mes_operacional()
returns timestamptz
language sql
stable
as $$
  select date_trunc('month', now() at time zone interval '-03:00')
           at time zone interval '-03:00';
$$;

grant execute on function public.inicio_do_mes_operacional() to authenticated;

-- 2) Totais do mes -----------------------------------------------------------
-- Uma linha so, para a faixa de indicadores do topo.

create or replace view public.resumo_operacional_do_mes
with (security_invoker = true) as
select
  -- `distinct` porque uma visita tem varias leituras (tipicamente Inicio e
  -- Termino): sem ele, o numero de visitas viria inflado pelo join.
  count(distinct v.id)::bigint      as visitas,
  count(l.id)::bigint               as leituras,
  count(distinct v.site_id)::bigint as sites_visitados
from public.leituras l
join public.visitas v on v.id = l.visita_id
where l.data_hora >= public.inicio_do_mes_operacional()
  and l.data_hora < public.inicio_do_mes_operacional() + interval '1 month';

comment on view public.resumo_operacional_do_mes is
  'Totais do mes corrente para o dashboard. security_invoker: o RLS de visitas
   e leituras continua valendo para quem consulta.';

grant select on public.resumo_operacional_do_mes to authenticated;

-- 3) Meta x realizado por site -----------------------------------------------
-- Alimenta o grafico que a 0004 antecipou.

create or replace view public.resumo_metas_do_mes
with (security_invoker = true) as
with realizadas_por_site as (
  select
    v.site_id,
    count(distinct v.id) as realizadas
  from public.visitas v
  join public.leituras l on l.visita_id = v.id
  where l.data_hora >= public.inicio_do_mes_operacional()
    and l.data_hora < public.inicio_do_mes_operacional() + interval '1 month'
  group by v.site_id
)
select
  m.site_id,
  s.nome                             as site,
  g.nome                             as grupo,
  m.quantidade_esperada::bigint      as esperadas,
  coalesce(r.realizadas, 0)::bigint  as realizadas
from public.metas_visitas m
join public.sites s        on s.id = m.site_id
join public.grupos_sites g on g.id = s.grupo_site_id
-- `left join`: site com meta e nenhuma visita e exatamente o caso que o
-- grafico precisa mostrar. Um inner join o esconderia -- o pior resultado
-- possivel sumindo do relatorio de desempenho.
left join realizadas_por_site r on r.site_id = m.site_id
where m.competencia = public.inicio_do_mes_operacional()::date;

comment on view public.resumo_metas_do_mes is
  'Meta x realizado por site no mes corrente. metas_visitas so e legivel por
   gestao (migration 0006), entao esta view volta vazia para os demais niveis
   -- decisao registrada la: o cliente ve o que foi executado, nao a meta
   contratada.';

grant select on public.resumo_metas_do_mes to authenticated;

-- 4) Indice para o recorte por mes -------------------------------------------
-- `metas_visitas` ja tem unique (site_id, competencia), mas a view filtra so
-- por competencia -- e a coluna lider daquele indice e `site_id`.
create index if not exists metas_visitas_competencia_idx
  on public.metas_visitas (competencia);
