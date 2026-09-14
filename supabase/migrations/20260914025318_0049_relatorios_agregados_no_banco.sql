-- ============================================================================
-- 0049 -- Relatorios de Inspecoes agregados no Postgres
--
-- P1-5 da auditoria de 11/09 (e item de Media prioridade em docs/melhorias.md).
-- Os seis relatorios de Inspecoes buscavam `leituras` linha a linha e agrupavam
-- em Node. Com zero leituras em producao isso nao doia; com um ano de ronda de
-- 15 inspetores vira transferencia de rede por leitura para fazer em JavaScript
-- o que o banco faz num `group by`. Tres deles ainda tinham teto (5.000
-- leituras) e avisavam "truncado" -- um relatorio mensal que nao responde o mes.
--
-- DESENHO EM DOIS ANDARES
--
--   `visitas_do_periodo` -- uma linha por VISITA com leitura no periodo, ja
--   filtrada. E a etapa que os seis faziam igual, cada um com a sua copia em
--   TypeScript: agrupar por visita, achar o primeiro Inicio e o ultimo Termino,
--   e aplicar os filtros de detalhe como "alguma leitura da visita tem este
--   valor". Seis copias viravam seis lugares para a regra divergir.
--
--   `relatorio_*` -- uma por tela, em cima da primeira, com a agregacao propria
--   (contagem, soma, site x dia). O TypeScript fica so com formatacao.
--
-- SECURITY INVOKER EM TODAS. Nenhuma funcao aqui empresta privilegio: as
-- consultas passam pelo RLS de `leituras`, `visitas`, `sites` e `profiles` com
-- o `auth.uid()` de quem chamou, exatamente como o `select` do PostgREST que
-- elas substituem. Um CLIENTE continua vendo so o proprio escopo (0014).
--
-- SEMANTICA PRESERVADA, COM DUAS EXCECOES DELIBERADAS
--
--   1) Periodo meio-aberto `[inicio, fim)`. As telas usavam
--      `lte('...T23:59:59-03:00')`, que perdia leitura em 23:59:59.5. Quem chama
--      agora manda o inicio do dia seguinte como `fim`.
--   2) Observacao e evento "da visita" passam a ser os da leitura mais antiga
--      que os tem. Antes era "a primeira encontrada" na ordem em que o PostgREST
--      devolvesse -- em Supervisao, sem `order by`, isso nao era determinstico.
--
-- FILTROS EM JSONB. Doze filtros opcionais, quase todos repetidos entre as
-- telas. Um parametro por filtro multiplicaria a assinatura de seis funcoes;
-- `p_filtros` recebe so os presentes. Valor que nao converte (`site=abc` na
-- URL) levanta 22P02 -- o mesmo que o `.eq()` do PostgREST fazia antes.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Uma linha por visita
-- ---------------------------------------------------------------------------

create or replace function public.visitas_do_periodo(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  visita_id bigint,
  site_id bigint,
  funcionario_id uuid,
  motivo_visita_id bigint,
  primeira_leitura timestamptz,
  inicio timestamptz,
  termino timestamptz,
  tem_localizacao boolean,
  observacao text,
  evento_id bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'motivo', '')::bigint        as motivo,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'tipo_servico', '')::bigint  as tipo_servico,
      nullif(p_filtros ->> 'area', '')::bigint          as area,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'qualificador', '')::bigint  as qualificador,
      nullif(p_filtros ->> 'checkpoint', '')::bigint    as checkpoint,
      nullif(p_filtros ->> 'atividade', '')::bigint     as atividade
  ),
  lidas as (
    select
      l.id,
      l.visita_id,
      l.data_hora,
      l.tem_localizacao,
      l.observacao,
      l.evento_id,
      v.site_id,
      v.funcionario_id,
      v.motivo_visita_id,
      a.nome as area_nome,
      -- Filtros de DETALHE: avaliados por leitura, decididos por visita no
      -- `having` abaixo. Filtrar a leitura direto no `where` excluiria o
      -- Inicio OU o Termino da ronda e quebraria a duracao -- o motivo de
      -- `combinaFiltrosDeDetalhe` existir em cada tela.
      (    (f.area is null or l.area_id = f.area)
       and (f.evento is null or l.evento_id = f.evento)
       and (f.qualificador is null or l.qualificador_id = f.qualificador)
       and (f.checkpoint is null or l.qr_code_id = f.checkpoint)
       and (f.atividade is null or l.acao_id = f.atividade)) as combina_detalhe
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    -- `left join`: nem toda tela exigia o site visivel, e um `inner` aqui
    -- mudaria o resultado das que nao exigiam. Quem precisa do nome do site
    -- faz o `join` no proprio relatorio.
    left join public.sites s on s.id = v.site_id
    left join public.areas a on a.id = l.area_id
    cross join f
    where l.data_hora >= p_inicio
      and l.data_hora < p_fim
      -- Filtros de VISITA: valem para todas as leituras dela, entao podem
      -- recortar ja no `where`.
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.motivo is null or v.motivo_visita_id = f.motivo)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.tipo_servico is null or s.tipo_servico_id = f.tipo_servico)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  )
  select
    visita_id,
    site_id,
    funcionario_id,
    motivo_visita_id,
    min(data_hora)                                         as primeira_leitura,
    min(data_hora) filter (where area_nome = 'Início')     as inicio,
    max(data_hora) filter (where area_nome = 'Término')    as termino,
    coalesce(bool_or(tem_localizacao), false)              as tem_localizacao,
    (array_agg(observacao order by data_hora, id)
       filter (where nullif(btrim(observacao), '') is not null))[1] as observacao,
    (array_agg(evento_id order by data_hora, id)
       filter (where evento_id is not null))[1]            as evento_id
  from lidas
  group by visita_id, site_id, funcionario_id, motivo_visita_id
  having bool_or(combina_detalhe)
$$;

comment on function public.visitas_do_periodo(timestamptz, timestamptz, jsonb) is
  'Uma linha por visita com leitura em [p_inicio, p_fim), com os filtros de
   visita e de detalhe aplicados (0049). Base dos relatorio_*. SECURITY INVOKER:
   o RLS de quem chama recorta o resultado.';

-- ---------------------------------------------------------------------------
-- 2) Os seis relatorios
--
-- Todos devolvem so o que a tela precisa, ja agregado. Ordenacao de texto
-- (nome de site, de funcionario) fica no TypeScript com `localeCompare("pt-BR")`,
-- como ja estava: a collation do banco nao e garantidamente a mesma, e a ordem
-- da tela nao deve mudar com a troca.
-- ---------------------------------------------------------------------------

-- Registro de Rondas: uma linha por Local x dia, com a duracao de cada ronda.
-- Duracao so existe com Inicio E Termino e Termino depois do Inicio -- mesma
-- regra de `agruparEmLinhas`.
create or replace function public.relatorio_registro_de_rondas(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (site_id bigint, site_nome text, dia smallint, duracoes_ms bigint[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    v.site_id,
    s.nome,
    extract(day from (v.inicio at time zone interval '-03:00'))::smallint as dia,
    array_agg(round(extract(epoch from (v.termino - v.inicio)) * 1000)::bigint order by v.inicio)
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  join public.sites s on s.id = v.site_id
  where v.inicio is not null
    and v.termino is not null
    and v.termino > v.inicio
  group by v.site_id, s.nome, 3
$$;

-- Horas por Usuario: soma das duracoes e quantas visitas entraram na soma.
create or replace function public.relatorio_horas_por_usuario(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (funcionario_id uuid, total_ms bigint, visitas integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    v.funcionario_id,
    sum(round(extract(epoch from (v.termino - v.inicio)) * 1000))::bigint,
    count(*)::integer
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  where v.funcionario_id is not null
    and v.inicio is not null
    and v.termino is not null
    and v.termino > v.inicio
  group by v.funcionario_id
$$;

-- Ranking de Inspecoes: visitas distintas por funcionario. Nao exige par
-- Inicio/Termino -- uma visita com qualquer leitura no periodo conta, como
-- antes.
create or replace function public.relatorio_ranking_de_inspecoes(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (funcionario_id uuid, nome text, quantidade integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select v.funcionario_id, coalesce(p.nome_completo, ''), count(*)::integer
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  left join public.profiles p on p.id = v.funcionario_id
  where v.funcionario_id is not null
  group by v.funcionario_id, p.nome_completo
$$;

-- Mapa de Locais Inspecionados: visitas distintas por Local x dia. O dia de
-- uma visita e o da sua leitura mais antiga no periodo, entao cada visita
-- conta em um dia so.
create or replace function public.relatorio_mapa_de_locais(
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
  select v.site_id, (v.primeira_leitura at time zone interval '-03:00')::date, count(*)::integer
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  group by v.site_id, 2
$$;

-- Inspecoes com Inicio e Fim: lista por visita, nao agregacao -- a tela e uma
-- tabela de visitas. O ganho aqui e o agrupamento das leituras sair do Node;
-- a lista continua paginada por quem chama.
create or replace function public.relatorio_inspecoes_inicio_fim(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  visita_id bigint,
  inicio timestamptz,
  termino timestamptz,
  duracao_ms bigint,
  usuario text,
  regional text,
  site text,
  evento text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    v.visita_id,
    v.inicio,
    v.termino,
    round(extract(epoch from (v.termino - v.inicio)) * 1000)::bigint,
    coalesce(p.nome_completo, ''),
    coalesce(s.regional, ''),
    s.nome,
    coalesce(e.nome, '')
  from public.visitas_do_periodo(p_inicio, p_fim, p_filtros) v
  join public.sites s on s.id = v.site_id
  left join public.profiles p on p.id = v.funcionario_id
  left join public.eventos e on e.id = v.evento_id
  where v.inicio is not null
    and v.termino is not null
    and v.termino > v.inicio
$$;

-- Visitas de Supervisao: lista por visita de UM site num periodo.
create or replace function public.relatorio_visitas_de_supervisao(
  p_site bigint,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns table (
  visita_id bigint,
  data_hora timestamptz,
  funcionario text,
  local text,
  tem_localizacao boolean,
  motivo_visita text,
  observacao text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    v.visita_id,
    v.primeira_leitura,
    coalesce(p.nome_completo, ''),
    coalesce(s.nome, ''),
    v.tem_localizacao,
    coalesce(m.nome, ''),
    coalesce(v.observacao, '')
  from public.visitas_do_periodo(p_inicio, p_fim, jsonb_build_object('site', p_site)) v
  left join public.profiles p on p.id = v.funcionario_id
  left join public.sites s on s.id = v.site_id
  left join public.motivos_visita m on m.id = v.motivo_visita_id
$$;

-- ---------------------------------------------------------------------------
-- 3) Grants
--
-- So `authenticated`, como as telas. `anon` nao ve linha nenhuma pelo RLS de
-- qualquer forma, mas a 0027 fechou `anon` nas funcoes de leitura e a regra
-- vale sem excecao.
-- ---------------------------------------------------------------------------

revoke all on function public.visitas_do_periodo(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_registro_de_rondas(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_horas_por_usuario(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_ranking_de_inspecoes(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_mapa_de_locais(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_inspecoes_inicio_fim(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz) from public, anon;

grant execute on function public.visitas_do_periodo(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_registro_de_rondas(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_horas_por_usuario(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_ranking_de_inspecoes(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_mapa_de_locais(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_inspecoes_inicio_fim(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz) to authenticated;
