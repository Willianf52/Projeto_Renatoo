-- ============================================================================
-- 0108: checklist com ordem aleatoria, peso e pergunta condicional
--
-- Pedido do dono (18/11/2026), primeira entrega dos "recursos avancados do
-- checklist" da #218, que o sistema antigo oferece no cadastro:
--
--   * modelos_checklist.ordem_aleatoria: o app embaralha as perguntas (dentro
--     de cada grupo), sempre na mesma ordem para a mesma inspecao.
--   * perguntas_checklist.peso (1 a 10, padrao 1): a nota vira media ponderada.
--     Com peso 1 em todas, a nota e a de antes.
--   * perguntas_checklist.pergunta_base_id + resposta_gatilho: a pergunta so
--     aparece no app quando a pergunta base recebe aquela resposta. Um nivel
--     so (a base nao pode ser condicional), da mesma lista (mesmo modelo).
--
-- O banco nao exige resposta de pergunta nenhuma (0099), entao a pergunta
-- escondida nao muda o envio: quem esconde e o app. A nota no banco
-- (historico_de_checklist) passa a usar o peso; a do portal e do app, pelo
-- `notaDoChecklist` do shared, tambem.
--
-- Nota do levantamento de 13/11 (0099): no antigo, peso e desvio estavam todos
-- no padrao. Os recursos entram vazios; nada muda ate alguem usar.
-- ============================================================================

alter table public.modelos_checklist
  add column if not exists ordem_aleatoria boolean not null default false;

comment on column public.modelos_checklist.ordem_aleatoria is
  'Verdadeiro: o app embaralha as perguntas dentro de cada grupo, de forma fixa por inspecao (0108).';

alter table public.perguntas_checklist
  add column if not exists peso smallint not null default 1,
  add column if not exists pergunta_base_id bigint references public.perguntas_checklist (id) on delete restrict,
  add column if not exists resposta_gatilho text;

alter table public.perguntas_checklist drop constraint if exists perguntas_checklist_peso_check;
alter table public.perguntas_checklist
  add constraint perguntas_checklist_peso_check check (peso between 1 and 10);

alter table public.perguntas_checklist drop constraint if exists perguntas_checklist_condicional_check;
alter table public.perguntas_checklist
  add constraint perguntas_checklist_condicional_check check (
    (pergunta_base_id is null and resposta_gatilho is null)
    or (pergunta_base_id is not null and resposta_gatilho in ('SIM', 'NAO', 'NA') and pergunta_base_id <> id)
  );

create index if not exists perguntas_checklist_base_idx
  on public.perguntas_checklist (pergunta_base_id) where pergunta_base_id is not null;

comment on column public.perguntas_checklist.peso is
  'Peso da pergunta na nota (1 a 10, padrao 1): a nota e a media ponderada dos Conforme (0108).';
comment on column public.perguntas_checklist.pergunta_base_id is
  'Pergunta condicional (0108): so aparece quando esta pergunta base recebe `resposta_gatilho`.';
comment on column public.perguntas_checklist.resposta_gatilho is
  'SIM, NAO ou NA da pergunta base que faz esta aparecer (0108).';

grant select (ordem_aleatoria), insert (ordem_aleatoria), update (ordem_aleatoria)
  on public.modelos_checklist to authenticated;
grant select (peso, pergunta_base_id, resposta_gatilho),
      insert (peso, pergunta_base_id, resposta_gatilho),
      update (peso, pergunta_base_id, resposta_gatilho)
  on public.perguntas_checklist to authenticated;

-- ---------------------------------------------------------------------------
-- A condicional so faz sentido dentro da mesma lista e em um nivel
-- ---------------------------------------------------------------------------
create or replace function manutencao.validar_pergunta_condicional()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_base record;
begin
  if new.pergunta_base_id is null then
    -- Deixar de ser condicional e sempre permitido.
    return new;
  end if;

  select p.modelo_id, p.tipo_resposta, p.pergunta_base_id
    into v_base
    from public.perguntas_checklist p
   where p.id = new.pergunta_base_id;
  if not found then
    return new; -- a FK responde
  end if;

  if v_base.modelo_id is distinct from new.modelo_id then
    raise exception 'A pergunta base precisa ser do mesmo modelo.' using errcode = '23514';
  end if;
  if v_base.pergunta_base_id is not null then
    raise exception 'A pergunta base nao pode ser condicional: um nivel so.' using errcode = '23514';
  end if;
  if exists (select 1 from public.perguntas_checklist f where f.pergunta_base_id = new.id) then
    raise exception 'Esta pergunta ja e base de outra e nao pode virar condicional.' using errcode = '23514';
  end if;
  if new.resposta_gatilho = 'NA' and v_base.tipo_resposta <> 'CNA' then
    raise exception 'A pergunta base nao tem "Nao se aplica".' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function manutencao.validar_pergunta_condicional() from public, anon, authenticated;

drop trigger if exists validar_pergunta_condicional on public.perguntas_checklist;
create trigger validar_pergunta_condicional
  before insert or update of pergunta_base_id, resposta_gatilho on public.perguntas_checklist
  for each row execute function manutencao.validar_pergunta_condicional();

-- ---------------------------------------------------------------------------
-- Duplicar leva o peso, a ordem aleatoria e a condicional (apontando para a
-- copia da base, achada pela ordem, que e unica no modelo). O resto como 0099.
-- ---------------------------------------------------------------------------
create or replace function public.duplicar_modelo(p_modelo_id bigint, p_nome text)
returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.modelos_checklist where id = p_modelo_id) then
    raise exception 'Modelo inexistente.' using errcode = '23514';
  end if;

  -- Nasce ativo e sem grupos: so passa a valer quando alguem ligar a um grupo.
  insert into public.modelos_checklist (nome, ativo, descricao, ordem_aleatoria)
  select btrim(p_nome), true, m.descricao, m.ordem_aleatoria
    from public.modelos_checklist m
   where m.id = p_modelo_id
  returning id into v_id;

  insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta, evento_id, grupo_pergunta_id, ativo, obrigatoria, peso)
  select v_id, p.ordem, p.texto, p.tipo_resposta, p.evento_id, p.grupo_pergunta_id, p.ativo, p.obrigatoria, p.peso
    from public.perguntas_checklist p
   where p.modelo_id = p_modelo_id;

  update public.perguntas_checklist copia
     set pergunta_base_id = base_copia.id,
         resposta_gatilho = original.resposta_gatilho
    from public.perguntas_checklist original
    join public.perguntas_checklist base_original on base_original.id = original.pergunta_base_id
    join public.perguntas_checklist base_copia
      on base_copia.modelo_id = v_id and base_copia.ordem = base_original.ordem
   where original.modelo_id = p_modelo_id
     and copia.modelo_id = v_id
     and copia.ordem = original.ordem;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Historico: a nota com peso. A funcao e a da 0089, so com as duas contas da
-- nota ponderadas (`peso` vem da pergunta; sem pergunta, 1).
-- ---------------------------------------------------------------------------

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
      p_filtros ->> 'origem' as origem,
      p_filtros ->> 'situacao' as situacao,
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
      c.aprovacao,
      c.modelo_id,
      m.nome as modelo_nome,
      v.criado_em as inicio_em,
      v.funcionario_id,
      p.nome_completo as responsavel,
      s.id as site_id,
      s.nome as site_nome,
      coalesce(nullif(cm.caminho, ''), s.nome) as caminho,
      mv.nome as motivo_da_visita,
      coalesce(pm.total, 0) as total_perguntas,
      ag.agenda_id,
      ag.agenda_nome,
      ag.data_planejada,
      case
        when ag.agenda_id is null then 'no_prazo'
        when (c.criado_em at time zone 'America/Sao_Paulo')::date < ag.data_planejada then 'antecipado'
        when (c.criado_em at time zone 'America/Sao_Paulo')::date <= ag.data_planejada + ag.tolerancia_dias then 'no_prazo'
        else 'atrasado'
      end as situacao
    from public.checklists_visita c
    join public.visitas v on v.id = c.visita_id
    join public.sites s on s.id = v.site_id
    left join public.modelos_checklist m on m.id = c.modelo_id
    left join public.profiles p on p.id = v.funcionario_id
    left join public.motivos_visita mv on mv.id = v.motivo_visita_id
    left join caminhos cm on cm.site_id = s.id
    left join perguntas_por_modelo pm on pm.modelo_id = c.modelo_id
    -- A agenda que o checklist cumpre (0084/0087): mesmo modelo, site da
    -- agenda, agenda ativa. A data planejada e a mais recente ate o dia do
    -- checklist; antes da primeira, a primeira (o checklist foi antecipado).
    left join lateral (
      select a.id as agenda_id, a.nome as agenda_nome, d::date as data_planejada, a.tolerancia_dias
        from public.agendas a
        join public.agenda_sites asg on asg.agenda_id = a.id and asg.site_id = s.id
       cross join lateral generate_series(
         a.data_inicial::timestamp,
         a.data_final::timestamp,
         case a.recorrencia
           when 'DIARIO' then interval '1 day'
           when 'SEMANAL' then interval '7 days'
           when 'QUINZENAL' then interval '14 days'
           when 'MENSAL' then interval '1 month'
           when 'BIMESTRAL' then interval '2 months'
           when 'TRIMESTRAL' then interval '3 months'
           when 'SEMESTRAL' then interval '6 months'
           else interval '1 year'
         end
       ) as d
       where a.ativo
         and a.modelo_id = c.modelo_id
       order by
         (d::date > (c.criado_em at time zone 'America/Sao_Paulo')::date),
         abs(d::date - (c.criado_em at time zone 'America/Sao_Paulo')::date),
         a.id
       limit 1
    ) ag on true
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
      and (f.origem is null or (f.origem = 'agenda') = (ag.agenda_id is not null))
      and (
        f.situacao is null
        or f.situacao = case
          when ag.agenda_id is null then 'no_prazo'
          when (c.criado_em at time zone 'America/Sao_Paulo')::date < ag.data_planejada then 'antecipado'
          when (c.criado_em at time zone 'America/Sao_Paulo')::date <= ag.data_planejada + ag.tolerancia_dias then 'no_prazo'
          else 'atrasado'
        end
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
          -- Media ponderada pelo peso da pergunta (0108); peso 1 em todas da a
          -- conta de antes.
          case
            when coalesce(sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'), 0) = 0 then null
            else floor(
              (
                coalesce(sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'), 0)::float8
                / (sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo,
            coalesce(pq.peso, 1) as peso
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
         -- Aprovacao (0089).
         or (f.conclusao = 'aguardando_autorizacao' and cr.aprovacao = 'AGUARDANDO')
         or (f.conclusao = 'aprovado' and cr.aprovacao = 'APROVADO')
         or (f.conclusao = 'reprovado' and cr.aprovacao = 'REPROVADO')
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
          -- Media ponderada pelo peso da pergunta (0108); peso 1 em todas da a
          -- conta de antes.
          case
            when coalesce(sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'), 0) = 0 then null
            else floor(
              (
                coalesce(sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta = 'SIM'), 0)::float8
                / (sum(t.peso) filter (where t.tipo <> 'SN' and t.resposta <> 'NA'))::float8
              ) * 100::float8 + 0.5::float8
            )::integer
          end as nota
        from (
          select
            r.resposta,
            case when pq.tipo_resposta in ('CNA', 'CN', 'SN') then pq.tipo_resposta else 'CNA' end as tipo,
            coalesce(pq.peso, 1) as peso
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
            'nota', pg.nota,
            'agenda_id', pg.agenda_id,
            'agenda_nome', pg.agenda_nome,
            'data_planejada', pg.data_planejada,
            'situacao', pg.situacao,
            'aprovacao', pg.aprovacao
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
