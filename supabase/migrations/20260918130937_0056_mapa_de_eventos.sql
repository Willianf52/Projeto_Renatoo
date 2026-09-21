-- ============================================================================
-- 0056 -- Mapa de Eventos, e uma base comum para os relatorios de Eventos
--
-- Mapa de Eventos e a grade Evento x dia do mes: quantas ocorrencias de cada
-- evento em cada dia, com o TOTAL da linha e a linha Total por dia.
--
-- DESENHO EM DOIS ANDARES, COMO A 0049
--
--   `ocorrencias_de_evento` -- uma linha por OCORRENCIA (leitura com evento)
--   no periodo, ja filtrada, com site, grupo e evento resolvidos. E o que
--   Registro de Eventos (0055) fazia sozinho, e o que Mapa de Eventos precisa
--   igual. As telas de Eventos que ainda faltam (Mapa por Site, Eventos por
--   Site, Graficos) contam a mesma coisa cortada de outro jeito -- com uma
--   copia do filtro por tela, a regra de "o que e uma ocorrencia" e "o que o
--   filtro X recorta" divergiria na terceira.
--
--   `relatorio_*` -- a agregacao propria de cada tela, em cima da base.
--
-- `relatorio_registro_de_eventos` e REESCRITA aqui sobre a base, com a mesma
-- assinatura e o mesmo retorno -- `create or replace` basta, e a tela nao
-- muda. O teste da 0055 continua valendo sem alteracao, e e ele que garante
-- que a reescrita nao mudou a contagem.
--
-- FILTRO NOVO: `atividade` (`leituras.acao_id`). O campo "Atividades" da tela
-- de referencia, mesmo mapeamento dos relatorios de Inspecoes (ver o
-- comentario de `Filtros.atividade` em registro-de-rondas/queries.ts). E
-- filtro de LEITURA, nao de visita: aqui cada linha ja e uma leitura, entao
-- nao ha o problema de "cortar o Inicio da ronda" que a 0049 resolve com o
-- `having`.
--
-- SECURITY INVOKER em todas, como as demais `relatorio_*`: o RLS de
-- `leituras`, `visitas` e `sites` de quem chamou recorta o resultado.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Uma linha por ocorrencia de evento
-- ---------------------------------------------------------------------------

create or replace function public.ocorrencias_de_evento(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_por_data_insercao boolean default false,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  site_id bigint,
  site_nome text,
  grupo_site_nome text,
  evento_id bigint,
  evento_nome text,
  quando timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with f as (
    -- Mesmo contrato de `visitas_do_periodo`: so as chaves presentes contam,
    -- e valor que nao converte (`?sites=abc` na URL) levanta 22P02.
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados,
      nullif(p_filtros ->> 'atividade', '')::bigint     as atividade
  ),
  lidas as (
    select
      v.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      l.evento_id as eid,
      e.nome    as enome,
      -- Qual carimbo o periodo recorta: insercao (quando o lote subiu) ou
      -- data do evento (quando o inspetor registrou). Ver o cabecalho da 0055.
      case when p_por_data_insercao then l.data_integracao else l.data_hora end as q
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    -- `inner join` com `sites` de proposito: leitura de site fora do escopo
    -- de quem chama some da contagem, em vez de aparecer sem nome.
    join public.sites s on s.id = v.site_id
    join public.eventos e on e.id = l.evento_id
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where l.evento_id is not null
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.evento is null or l.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.atividade is null or l.acao_id = f.atividade)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  )
  select sid, snome, gnome, eid, enome, q
  from lidas
  -- Periodo meio-aberto `[inicio, fim)`. `q` nulo (insercao pendente, no
  -- recorte por insercao) nao satisfaz nenhum dos lados e cai fora.
  where q >= p_inicio
    and q < p_fim
$$;

comment on function public.ocorrencias_de_evento(timestamptz, timestamptz, boolean, jsonb) is
  'Uma linha por leitura com evento em [p_inicio, p_fim), filtrada, com site,
   grupo e evento resolvidos (0056). Base dos relatorios de Eventos. SECURITY
   INVOKER: o RLS de quem chama recorta o resultado.';

-- ---------------------------------------------------------------------------
-- 2) Registro de Eventos, agora sobre a base
-- ---------------------------------------------------------------------------
-- Mesma assinatura e mesmo retorno da 0055: `create or replace` troca so o
-- corpo, e os grants dela continuam valendo.

create or replace function public.relatorio_registro_de_eventos(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_por_data_insercao boolean default false,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  site_id bigint,
  site_nome text,
  grupo_site_nome text,
  evento_id bigint,
  evento_nome text,
  quantidade integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select o.site_id, o.site_nome, o.grupo_site_nome, o.evento_id, o.evento_nome, count(*)::integer
  from public.ocorrencias_de_evento(p_inicio, p_fim, p_por_data_insercao, p_filtros) o
  group by o.site_id, o.site_nome, o.grupo_site_nome, o.evento_id, o.evento_nome
$$;

-- ---------------------------------------------------------------------------
-- 3) Mapa de Eventos: Evento x dia
-- ---------------------------------------------------------------------------
-- Recorta pela DATA DO EVENTO: a tela nao tem o seletor de "Data de
-- Inserção" do Registro, e o dia da coluna e o dia em que a ocorrencia
-- aconteceu -- contar pelo dia em que o lote subiu poria a ocorrencia de
-- sabado na coluna de segunda.
--
-- O dia e o de Brasilia (-03:00, sem horario de verao desde 2019), como em
-- `relatorio_registro_de_rondas`: no fuso da sessao (UTC) a ocorrencia das
-- 22:30 cairia no dia seguinte.

create or replace function public.relatorio_mapa_de_eventos(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_filtros jsonb default '{}'::jsonb
)
returns table (evento_id bigint, evento_nome text, dia smallint, quantidade integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    o.evento_id,
    o.evento_nome,
    extract(day from (o.quando at time zone interval '-03:00'))::smallint,
    count(*)::integer
  from public.ocorrencias_de_evento(p_inicio, p_fim, false, p_filtros) o
  group by o.evento_id, o.evento_nome, 3
$$;

comment on function public.relatorio_mapa_de_eventos(timestamptz, timestamptz, jsonb) is
  'Ocorrencias de evento por Evento x dia (fuso -03:00) em [p_inicio, p_fim),
   recortadas pela data do evento (0056). SECURITY INVOKER.';

-- ---------------------------------------------------------------------------
-- 4) Grants
-- ---------------------------------------------------------------------------
-- Mesmo fechamento da 0049/0055: `public` e `anon` perdem o execute que o
-- Postgres concede por padrao a toda funcao nova.

revoke all on function public.ocorrencias_de_evento(timestamptz, timestamptz, boolean, jsonb) from public, anon;
revoke all on function public.relatorio_mapa_de_eventos(timestamptz, timestamptz, jsonb) from public, anon;

grant execute on function public.ocorrencias_de_evento(timestamptz, timestamptz, boolean, jsonb) to authenticated;
grant execute on function public.relatorio_mapa_de_eventos(timestamptz, timestamptz, jsonb) to authenticated;
