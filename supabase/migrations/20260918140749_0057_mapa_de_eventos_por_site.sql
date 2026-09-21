-- ============================================================================
-- 0057 -- Mapa de Eventos por Site
--
-- A tela e uma arvore (organizacao > grupo > site) com uma coluna por dia do
-- periodo escolhido, e em cada celula a quantidade de ocorrencias de evento
-- daquele site naquele dia. Todo site aparece, mesmo com zero -- como no Mapa
-- de Locais Inspecionados, o ponto e ver onde NAO houve evento tambem.
--
-- A lista de sites (as linhas) vem do TypeScript, pela tabela `sites`, como no
-- Mapa de Locais; o banco devolve so as contagens que existem. A soma do grupo
-- e da organizacao tambem e feita la: sao somas de linhas que ja estao na tela.
--
-- Mesma base da 0056 (`ocorrencias_de_evento`), recortada pela DATA DO
-- EVENTO: a coluna e o dia em que a ocorrencia aconteceu. O dia e o de
-- Brasilia (-03:00), como em `relatorio_mapa_de_eventos`.
--
-- SECURITY INVOKER: o RLS de quem chamou recorta o resultado.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================================

create or replace function public.relatorio_mapa_de_eventos_por_site(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (site_id bigint, dia date, quantidade integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    o.site_id,
    (o.quando at time zone interval '-03:00')::date,
    count(*)::integer
  from public.ocorrencias_de_evento(p_inicio, p_fim, false, p_filtros) o
  group by o.site_id, 2
$$;

comment on function public.relatorio_mapa_de_eventos_por_site(timestamptz, timestamptz, jsonb) is
  'Ocorrencias de evento por Site x dia (fuso -03:00) em [p_inicio, p_fim),
   recortadas pela data do evento (0057). SECURITY INVOKER.';

revoke all on function public.relatorio_mapa_de_eventos_por_site(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.relatorio_mapa_de_eventos_por_site(timestamptz, timestamptz, jsonb) to authenticated;
