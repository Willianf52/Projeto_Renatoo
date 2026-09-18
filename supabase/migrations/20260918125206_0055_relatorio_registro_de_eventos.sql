-- ============================================================================
-- 0055 -- Registro de Eventos agregado no Postgres
--
-- Primeira tela de Eventos > Relatorios a sair de `TelaEmPreparacao`. Ela
-- conta ocorrencias de evento por Site x Evento e mostra a participacao de
-- cada linha no total (a coluna "%").
--
-- POR QUE NAO REAPROVEITA `visitas_do_periodo` (0049)
--
-- Aquela funcao devolve UMA linha por visita, e o evento "da visita" e o da
-- leitura mais antiga que tem evento. Serve para os relatorios de Inspecoes,
-- que contam visitas. Aqui a unidade e a OCORRENCIA: uma visita em que o
-- inspetor registrou tres vezes o mesmo evento vale tres, e uma visita com
-- dois eventos diferentes aparece em duas linhas. Passar por
-- `visitas_do_periodo` perderia da segunda ocorrencia em diante -- seria um
-- relatorio de eventos que subnotifica justamente o site com mais eventos.
--
-- DUAS DATAS, UM FILTRO. O campo "Data de Inserção" da tela escolhe sobre
-- qual carimbo o periodo recorta:
--
--   Data de Inserção  -> `leituras.data_integracao`, quando o lote subiu.
--   Data do Evento    -> `leituras.data_hora`, quando o inspetor registrou.
--
-- Os aparelhos guardam offline e sobem em lote (ver 0004), entao os dois
-- podem estar a dias de distancia: quem fecha o mes pela data em que o dado
-- chegou precisa do primeiro, quem investiga o que aconteceu no dia precisa
-- do segundo. Leitura com `data_integracao` nula fica de fora do recorte por
-- insercao -- nao ha em que dia coloca-la, e chutar `data_hora` misturaria os
-- dois criterios numa contagem so.
--
-- SECURITY INVOKER, como todas as `relatorio_*`: o RLS de `leituras`,
-- `visitas` e `sites` recorta com o `auth.uid()` de quem chamou -- o INSPETOR
-- so conta as proprias visitas, o CLIENTE so os sites do seu escopo (0014).
-- `inner join` com `sites` de proposito: leitura de site fora do escopo some
-- da contagem, em vez de aparecer com o nome em branco.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Indice do recorte por insercao
-- ---------------------------------------------------------------------------
-- `leituras_data_hora_idx` e `leituras_evento_id_idx` (0004) ja cobrem o
-- recorte por data do evento. O de insercao nao tinha indice nenhum em
-- `leituras` -- o que existia era o de `visitas.data_integracao`, outra
-- coluna. Parcial porque a consulta so olha linhas com evento, que sao a
-- minoria (campos de excecao, ver 0004).

create index if not exists leituras_evento_data_integracao_idx
  on public.leituras (data_integracao, evento_id)
  where evento_id is not null and data_integracao is not null;

-- ---------------------------------------------------------------------------
-- 2) O relatorio
-- ---------------------------------------------------------------------------
-- Uma linha por Site x Evento com a quantidade de ocorrencias no periodo. A
-- porcentagem e o TOTAL ficam no TypeScript: sao aritmetica sobre o que esta
-- na tela, e mandar a mesma soma repetida em toda linha so engorda a resposta.
--
-- Ordenacao (maior quantidade primeiro, depois o texto) tambem fica no
-- TypeScript, com `localeCompare("pt-BR")` -- mesma razao da 0049: a collation
-- do banco nao e garantidamente a mesma, e a ordem da tela nao deve mudar com
-- a troca de ambiente.

-- `drop` antes do `create`: o retorno ganhou `grupo_site_nome` depois da
-- primeira entrega desta migration, e `create or replace` nao troca o tipo de
-- retorno de uma funcao que ja exista -- falharia em quem aplicou a versao
-- anterior. Em banco limpo o `drop` nao encontra nada e segue.
drop function if exists public.relatorio_registro_de_eventos(timestamptz, timestamptz, boolean, jsonb);

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
  with f as (
    -- Mesmo contrato de `visitas_do_periodo`: so as chaves presentes contam,
    -- e valor que nao converte (`?sites=abc` na URL) levanta 22P02, como o
    -- `.eq()` do PostgREST levantava.
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados
  ),
  ocorrencias as (
    select
      v.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      l.evento_id as eid,
      e.nome    as enome,
      -- Um `case` so, calculado uma vez por linha, em vez de repetir a
      -- escolha nos dois limites do periodo.
      case when p_por_data_insercao then l.data_integracao else l.data_hora end as quando
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    join public.sites s on s.id = v.site_id
    join public.eventos e on e.id = l.evento_id
    -- A coluna Site mostra "UP Servicos > Grupo > Site", como a Hierarquia
    -- de Site / Planta. `left join`: site sem grupo continua contando.
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where l.evento_id is not null
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.evento is null or l.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  )
  select o.sid, o.snome, o.gnome, o.eid, o.enome, count(*)::integer
  from ocorrencias o
  -- Periodo meio-aberto `[inicio, fim)`, como nas demais `relatorio_*`:
  -- fechar em 23:59:59 perde a leitura com fracao de segundo. `quando` nulo
  -- (insercao pendente) nao satisfaz nenhum dos dois lados e cai fora.
  where o.quando >= p_inicio
    and o.quando < p_fim
  group by o.sid, o.snome, o.gnome, o.eid, o.enome
$$;

comment on function public.relatorio_registro_de_eventos(timestamptz, timestamptz, boolean, jsonb) is
  'Ocorrencias de evento por Site x Evento em [p_inicio, p_fim), recortadas por
   data de insercao (p_por_data_insercao) ou por data do evento (0055). Conta
   leituras, nao visitas. SECURITY INVOKER: o join com sites aplica o escopo de
   quem chama.';

-- ---------------------------------------------------------------------------
-- 3) Grants
-- ---------------------------------------------------------------------------
-- Mesmo fechamento da 0049: `public` e `anon` perdem o execute que o Postgres
-- concede por padrao a toda funcao nova; so `authenticated` chama.

revoke all on function public.relatorio_registro_de_eventos(timestamptz, timestamptz, boolean, jsonb) from public, anon;
grant execute on function public.relatorio_registro_de_eventos(timestamptz, timestamptz, boolean, jsonb) to authenticated;
