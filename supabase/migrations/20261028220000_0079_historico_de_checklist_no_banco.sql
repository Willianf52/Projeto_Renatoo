-- ============================================================================
-- 0079 -- Historico de Checklist filtrado e paginado no banco
--
-- A tela buscava TODOS os checklists do filtro com todas as respostas
-- embutidas (teto de 10.000) e so entao, em Node, calculava Nota, Conclusao e
-- Situacao, aplicava os filtros que dependem delas e cortava a pagina de 25. O
-- custo crescia com o periodo escolhido, e a policy de `checklist_respostas`
-- roda `pode_ver_visita` uma vez por RESPOSTA. No teste de carga de 28/10/2026
-- (PR #257, issue #258), com 75 checklists e 20 abas, a tela foi a p95 7 s;
-- com um ano de operacao, um filtro de periodo largo passaria dos 8 s de
-- `statement_timeout` do `authenticated` e a tela abriria com erro.
--
-- `historico_de_checklist` devolve so a pagina pedida e o total, ja com as
-- colunas derivadas. Duas rotas:
--
--   - SEM filtro de Conclusao ou de Nota (o uso normal): filtra, conta, corta
--     a pagina, e so entao soma as respostas das linhas da pagina. O custo das
--     respostas deixa de depender do tamanho do periodo.
--   - COM esses filtros: soma as respostas de todos os candidatos (a pagina so
--     pode ser cortada depois de saber quem passa), mas dentro do banco, sem
--     mandar as linhas de resposta para o Node.
--
-- `p_limite` nulo devolve tudo: e o que as exportacoes (Excel, PDF, PDF
-- Unificado, planilha de respostas) pedem, com o teto aplicado do lado delas.
--
-- AS REGRAS SAO AS DE `historico-de-checklist/queries.ts`, linha a linha:
--   - nao conformidade: "NAO" em pergunta que nao e Sim/Nao (0061);
--   - nota (`notaDoChecklist` do shared): Conforme / (respostas fora de
--     Sim/Nao e de "Nao se aplica"), em float8 e com floor(x + 0,5) -- o
--     mesmo `Math.round` do JavaScript, inclusive nos casos em que a divisao
--     binaria cai logo abaixo do ,5 (7/40 = 17,4999...);
--   - tipo da pergunta desconhecido ou ilegivel conta como CNA (`tipoDeResposta`);
--   - concluido: CORRETIVA, ou respondidas >= perguntas ATIVAS do modelo hoje;
--   - caminho do site: do mais alto ao proprio, so pelos sites que quem pede
--     enxerga, no maximo 10 niveis (`caminhoDoSite`);
--   - busca livre: Numero/Ano (5 digitos, sem cortar os maiores), caminho do
--     site, responsavel, motivo (o da corretiva, senao o da visita), "Corretiva"
--     ou "Consultoria" e o nome do modelo, sem diferenca de maiuscula;
--   - busca nas respostas: observacoes e o motivo digitado da corretiva.
-- Os filtros que nunca acham nada no sistema novo (Situacao diferente de "No
-- prazo", Origem Agenda, Atividade, Status Inativos, Conclusao fora de
-- Finalizado/Incompleto, Numero/Ano invalido) ficam no TypeScript, que nem
-- chama a funcao nesses casos.
--
-- SECURITY INVOKER, como as da 0049: tudo passa pelo RLS de quem chamou
-- (`checklists_visita`, `visitas`, `sites`, `profiles`, respostas, perguntas),
-- exatamente como o `select` do PostgREST que ela substitui. Os `join` com
-- `visitas` e `sites` sao internos, como os `!inner` de antes; `profiles` e
-- externo, salvo no filtro de Grupo de Usuarios.
-- ============================================================================

create or replace function public.historico_de_checklist(
  p_filtros jsonb,
  p_limite integer default null,
  p_deslocamento integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with recursive
  parametros as (
    select
      coalesce(p_filtros ->> 'campo_data', 'checklist') as campo_data,
      (p_filtros ->> 'inicio')::timestamptz as inicio,
      (p_filtros ->> 'fim')::timestamptz as fim,
      (p_filtros ->> 'numero')::integer as numero,
      (p_filtros ->> 'ano')::integer as ano,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'modelos', '[]'::jsonb))::bigint) as modelos,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'sites', '[]'::jsonb))::bigint) as sites,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'grupos_sites', '[]'::jsonb))::bigint) as grupos_sites,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'grupos_usuarios', '[]'::jsonb))::bigint) as grupos_usuarios,
      array(select jsonb_array_elements_text(coalesce(p_filtros -> 'responsaveis', '[]'::jsonb))::uuid) as responsaveis,
      p_filtros ->> 'conclusao' as conclusao,
      (p_filtros ->> 'nota_minima')::numeric as nota_minima,
      (p_filtros ->> 'nota_maxima')::numeric as nota_maxima,
      lower(nullif(btrim(p_filtros ->> 'busca'), '')) as busca,
      lower(nullif(btrim(p_filtros ->> 'busca_respostas'), '')) as busca_respostas,
      coalesce(p_filtros ->> 'ordem', 'recentes') = 'antigos' as ascendente
  ),
  -- Do proprio site ate o mais alto que quem pede enxerga.
  subida (site_id, superior_id, caminho, nivel) as (
    select s.id, s.site_superior_id, s.nome::text, 1
      from public.sites s
    union all
    select sb.site_id, acima.site_superior_id, acima.nome || ' → ' || sb.caminho, sb.nivel + 1
      from subida sb
      join public.sites acima on acima.id = sb.superior_id
     where sb.nivel < 10
  ),
  caminhos as (
    select distinct on (site_id) site_id, caminho
      from subida
     order by site_id, nivel desc
  ),
  perguntas_por_modelo as (
    select modelo_id, count(*)::integer as total
      from public.perguntas_checklist
     where ativo
     group by modelo_id
  ),
  base as (
    select
      c.id,
      c.numero,
      c.ano,
      c.tipo,
      c.motivo,
      c.criado_em,
      c.modelo_id,
      m.nome as modelo_nome,
      v.criado_em as inicio_em,
      v.funcionario_id,
      p.nome_completo as responsavel,
      s.id as site_id,
      s.nome as site_nome,
      coalesce(nullif(cm.caminho, ''), s.nome) as caminho,
      mv.nome as motivo_da_visita,
      coalesce(pm.total, 0) as total_perguntas
    from public.checklists_visita c
    join public.visitas v on v.id = c.visita_id
    join public.sites s on s.id = v.site_id
    left join public.modelos_checklist m on m.id = c.modelo_id
    left join public.profiles p on p.id = v.funcionario_id
    left join public.motivos_visita mv on mv.id = v.motivo_visita_id
    left join caminhos cm on cm.site_id = s.id
    left join perguntas_por_modelo pm on pm.modelo_id = c.modelo_id
    cross join parametros f
    where (cardinality(f.modelos) = 0 or c.modelo_id = any (f.modelos))
      and (cardinality(f.sites) = 0 or s.id = any (f.sites))
      and (cardinality(f.grupos_sites) = 0 or s.grupo_site_id = any (f.grupos_sites))
      and (cardinality(f.responsaveis) = 0 or v.funcionario_id = any (f.responsaveis))
      and (
        cardinality(f.grupos_usuarios) = 0
        or exists (
          select 1
            from public.profiles perfil
            join public.grupos_usuarios_membros gm on gm.profile_id = perfil.id
           where perfil.id = v.funcionario_id
             and gm.grupo_id = any (f.grupos_usuarios)
        )
      )
      and (f.numero is null or c.numero = f.numero)
      and (f.ano is null or c.ano = f.ano)
      and (f.inicio is null or (case when f.campo_data = 'visita' then v.criado_em else c.criado_em end) >= f.inicio)
      and (f.fim is null or (case when f.campo_data = 'visita' then v.criado_em else c.criado_em end) < f.fim)
      and (
        f.busca is null
        or strpos(
             case when length(c.numero::text) >= 5 then c.numero::text else lpad(c.numero::text, 5, '0') end
               || '/' || c.ano,
             f.busca
           ) > 0
        or strpos(lower(coalesce(nullif(cm.caminho, ''), s.nome)), f.busca) > 0
        or strpos(lower(coalesce(p.nome_completo, '')), f.busca) > 0
        or strpos(lower(coalesce(c.motivo, mv.nome, '')), f.busca) > 0
        or strpos(case when c.tipo = 'CORRETIVA' then 'corretiva' else 'consultoria' end, f.busca) > 0
        or strpos(lower(coalesce(m.nome, '')), f.busca) > 0
      )
      and (
        f.busca_respostas is null
        or strpos(lower(coalesce(c.motivo, '')), f.busca_respostas) > 0
        or exists (
          select 1
            from public.checklist_respostas r
           where r.checklist_id = c.id
             and strpos(lower(coalesce(r.observacao, '')), f.busca_respostas) > 0
        )
      )
  ),
  -- Conclusao e Nota pedem as respostas ANTES de cortar a pagina; sem eles,
  -- as respostas so sao somadas para as linhas da pagina (`pagina_simples`).
  --
  -- A soma das respostas aparece DUAS vezes (aqui e em `pagina_simples`) de
  -- proposito: uma CTE usada em dois lugares e materializada inteira pelo
  -- Postgres, e a rota normal voltaria a somar as respostas de todos os
  -- checklists do periodo.
  usa_derivados as (
    select (conclusao is not null or nota_minima is not null or nota_maxima is not null) as sim
      from parametros
  ),
  -- Rota COM Conclusao ou Nota: soma as respostas de todos os candidatos,
  -- filtra e so entao corta a pagina. O `where` com a subconsulta constante
  -- vira um filtro de uma vez so: na rota normal nada disto executa.
  com_respostas as (
    select b.*, a.respondidas, a.nao_conformidades, a.nota
      from base b
      cross join lateral (
        select
          count(*)::integer as respondidas,
          count(*) filter (where t.tipo <> 'SN' and t.resposta = 'NAO')::integer as nao_conformidades,
          case
            when count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA') = 0 then null
            else floor(
              (
                (count(*) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'))::float8
                / (count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo
          from public.checklist_respostas r
          left join public.perguntas_checklist pq on pq.id = r.pergunta_id
          where r.checklist_id = b.id
        ) t
      ) a
     where (select sim from usa_derivados)
  ),
  filtrado as (
    select cr.*
      from com_respostas cr
      cross join parametros f
     where (
         f.conclusao is null
         or (f.conclusao = 'finalizado' and (cr.tipo = 'CORRETIVA' or cr.respondidas >= cr.total_perguntas))
         or (f.conclusao = 'incompleto' and not (cr.tipo = 'CORRETIVA' or cr.respondidas >= cr.total_perguntas))
       )
       and (
         (f.nota_minima is null and f.nota_maxima is null)
         or (
           cr.nota is not null
           and (f.nota_minima is null or cr.nota >= f.nota_minima)
           and (f.nota_maxima is null or cr.nota <= f.nota_maxima)
         )
       )
  ),
  pagina_derivada as (
    select fd.*
      from filtrado fd
      cross join parametros f
     order by
       case when f.ascendente then fd.criado_em end asc,
       case when f.ascendente then fd.id end asc,
       case when not f.ascendente then fd.criado_em end desc,
       case when not f.ascendente then fd.id end desc
     limit p_limite
    offset coalesce(p_deslocamento, 0)
  ),
  -- Rota normal: corta a pagina na `base` e soma as respostas so dela. A soma
  -- e a mesma de `com_respostas`, repetida de proposito (ver acima).
  pagina_base as (
    select b.*
      from base b
      cross join parametros f
     where not (select sim from usa_derivados)
     order by
       case when f.ascendente then b.criado_em end asc,
       case when f.ascendente then b.id end asc,
       case when not f.ascendente then b.criado_em end desc,
       case when not f.ascendente then b.id end desc
     limit p_limite
    offset coalesce(p_deslocamento, 0)
  ),
  pagina_simples as (
    select pb.*, a.respondidas, a.nao_conformidades, a.nota
      from pagina_base pb
      cross join lateral (
        select
          count(*)::integer as respondidas,
          count(*) filter (where t.tipo <> 'SN' and t.resposta = 'NAO')::integer as nao_conformidades,
          case
            when count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA') = 0 then null
            else floor(
              (
                (count(*) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'))::float8
                / (count(*) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo
          from public.checklist_respostas r
          left join public.perguntas_checklist pq on pq.id = r.pergunta_id
          where r.checklist_id = pb.id
        ) t
      ) a
  ),
  pagina as (
    select * from pagina_derivada
    union all
    select * from pagina_simples
  )
  select jsonb_build_object(
    'total',
    case
      when (select sim from usa_derivados) then (select count(*) from filtrado)
      else (select count(*) from base)
    end,
    'linhas',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pg.id,
            'numero', pg.numero,
            'ano', pg.ano,
            'tipo', pg.tipo,
            'motivo', pg.motivo,
            'criado_em', pg.criado_em,
            'modelo_id', pg.modelo_id,
            'modelo_nome', pg.modelo_nome,
            'inicio_em', pg.inicio_em,
            'funcionario_id', pg.funcionario_id,
            'responsavel', pg.responsavel,
            'site_id', pg.site_id,
            'site_nome', pg.site_nome,
            'caminho', pg.caminho,
            'motivo_da_visita', pg.motivo_da_visita,
            'total_perguntas', pg.total_perguntas,
            'respondidas', pg.respondidas,
            'nao_conformidades', pg.nao_conformidades,
            'nota', pg.nota
          )
          order by
            case when f.ascendente then pg.criado_em end asc,
            case when f.ascendente then pg.id end asc,
            case when not f.ascendente then pg.criado_em end desc,
            case when not f.ascendente then pg.id end desc
        )
        from pagina pg
        cross join parametros f
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.historico_de_checklist(jsonb, integer, integer) from public, anon;
grant execute on function public.historico_de_checklist(jsonb, integer, integer) to authenticated;
