-- ============================================================================
-- 0107: a meta quinzenal conta 15 dias corridos a partir de uma data
--
-- O dono, em 18/11/2026: a quinzena da meta de visitas e de "15 dias corridos
-- a partir de uma data", e nao 1-15 e 16-fim do mes (como a 0106 fez).
--
-- O que muda:
--   * `metas_de_visita.inicia_em`: a data em que a meta comeca a valer. Na
--     QUINZENAL, e o primeiro dia da primeira quinzena: depois dela vem
--     [inicia_em + 15, inicia_em + 30), e assim por diante.
--   * Nos outros periodos o calendario continua o mesmo (o dia, segunda a
--     domingo, o mes); a data so diz a partir de quando a meta vale.
--   * Meta que ainda nao comecou nao entra no progresso nem no aviso.
--   * As metas que ja existiam comecam no dia em que foram criadas (hoje ha
--     uma so, semanal; nenhuma quinzenal).
--   * O aviso da quinzenal continua dois dias antes do fim do periodo.
-- ============================================================================

alter table public.metas_de_visita
  add column if not exists inicia_em date;

update public.metas_de_visita
   set inicia_em = (criado_em at time zone 'America/Sao_Paulo')::date
 where inicia_em is null;

alter table public.metas_de_visita
  alter column inicia_em set default ((now() at time zone 'America/Sao_Paulo')::date),
  alter column inicia_em set not null;

comment on column public.metas_de_visita.inicia_em is
  'Data em que a meta passa a valer. Na QUINZENAL, ancora os blocos de 15 dias corridos. 0107.';

-- A data entra pelo formulario: grant por coluna, como as outras (0106).
revoke insert, update on public.metas_de_visita from authenticated;
grant insert (usuario_id, site_id, periodo, quantidade, ativo, inicia_em) on public.metas_de_visita to authenticated;
grant update (quantidade, ativo, inicia_em) on public.metas_de_visita to authenticated;

-- ---------------------------------------------------------------------------
-- O periodo que contem um dia, agora com a data de inicio
-- ---------------------------------------------------------------------------
-- Troca de assinatura: a versao de dois argumentos sai, para nao haver duas
-- regras de quinzena no banco. Sem `p_inicia_em`, a quinzena comeca no proprio
-- dia pedido.
drop function if exists public.periodo_da_meta(text, date);

create or replace function public.periodo_da_meta(p_periodo text, p_dia date, p_inicia_em date default null)
returns table (inicio date, fim date)
language sql
immutable
set search_path = public, pg_temp
as $$
  with b as (
    select
      date_trunc('month', p_dia::timestamp)::date as mes,
      -- Primeiro dia da quinzena corrida que contem p_dia (floor tambem
      -- funciona antes da ancora, embora a meta ainda nao valha ali).
      coalesce(p_inicia_em, p_dia)
        + 15 * floor((p_dia - coalesce(p_inicia_em, p_dia)) / 15.0)::integer as quinzena
  )
  select
    case p_periodo
      when 'DIARIA' then p_dia
      -- date_trunc('week') e ISO: a semana comeca na segunda.
      when 'SEMANAL' then date_trunc('week', p_dia::timestamp)::date
      when 'QUINZENAL' then b.quinzena
      when 'MENSAL' then b.mes
    end,
    case p_periodo
      when 'DIARIA' then p_dia + 1
      when 'SEMANAL' then date_trunc('week', p_dia::timestamp)::date + 7
      when 'QUINZENAL' then b.quinzena + 15
      when 'MENSAL' then (b.mes + interval '1 month')::date
    end
  from b;
$$;

comment on function public.periodo_da_meta(text, date, date) is
  'Inicio (inclusive) e fim (exclusive) do periodo da meta que contem o dia: DIARIA, SEMANAL (segunda a domingo), QUINZENAL (15 dias corridos a partir de p_inicia_em) ou MENSAL. 0107.';

-- ---------------------------------------------------------------------------
-- Progresso: passa a data de inicio e ignora a meta que ainda nao comecou
-- ---------------------------------------------------------------------------
create or replace function public.progresso_das_metas(p_dia date default null)
returns table (
  meta_id bigint,
  usuario_id uuid,
  site_id bigint,
  periodo text,
  quantidade integer,
  feitas integer,
  inicio date,
  fim date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with d as (select coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date) as dia)
  select
    m.id,
    m.usuario_id,
    m.site_id,
    m.periodo,
    m.quantidade,
    (
      select count(*)::integer
        from public.checklists_visita c
        join public.visitas v on v.id = c.visita_id
       where v.site_id = m.site_id
         and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
         and c.criado_em >= (p.inicio::timestamp at time zone 'America/Sao_Paulo')
         and c.criado_em < (p.fim::timestamp at time zone 'America/Sao_Paulo')
    ),
    p.inicio,
    p.fim
  from public.metas_de_visita m
  cross join d
  cross join lateral public.periodo_da_meta(m.periodo, d.dia, m.inicia_em) p
  where m.ativo
    and m.inicia_em <= d.dia;
$$;

comment on function public.progresso_das_metas(date) is
  'Feitas/meta do periodo corrente de cada meta ativa, ja iniciada, que quem pergunta enxerga; conta qualquer checklist enviado pela pessoa no lugar. Security invoker. 0107.';

revoke all on function public.progresso_das_metas(date) from public, anon;
grant execute on function public.progresso_das_metas(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso: o mesmo da 0106, com a data de inicio
-- ---------------------------------------------------------------------------
create or replace function manutencao.avisar_metas(p_periodos text[], p_dia date default null)
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_pessoa record;
  v_total integer := 0;
begin
  for v_pessoa in
    with progresso as (
      select
        m.usuario_id,
        m.periodo,
        p.inicio,
        s.nome as site_nome,
        m.quantidade as meta,
        (
          select count(*)::integer
            from public.checklists_visita c
            join public.visitas v on v.id = c.visita_id
           where v.site_id = m.site_id
             and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
             and c.criado_em >= (p.inicio::timestamp at time zone 'America/Sao_Paulo')
             and c.criado_em < (p.fim::timestamp at time zone 'America/Sao_Paulo')
        ) as feitas,
        -- O dia do aviso de cada periodo (ver o cabecalho da 0106).
        case m.periodo
          when 'DIARIA' then p.inicio
          when 'SEMANAL' then p.inicio + 4
          when 'QUINZENAL' then p.fim - 3
          when 'MENSAL' then p.fim - 4
        end as dia_do_aviso
      from public.metas_de_visita m
      cross join lateral public.periodo_da_meta(m.periodo, v_dia, m.inicia_em) p
      join public.sites s on s.id = m.site_id
      join public.profiles pr on pr.id = m.usuario_id and pr.ativo
      where m.ativo and m.periodo = any (p_periodos) and m.inicia_em <= v_dia
    )
    select
      usuario_id,
      periodo,
      inicio,
      count(*) as lugares,
      string_agg(format('%s: %s de %s', site_nome, feitas, meta), '; ' order by site_nome) as resumo
    from progresso
    where feitas < meta and dia_do_aviso = v_dia
    group by usuario_id, periodo, inicio
  loop
    v_total := v_total + manutencao.notificar(
      array[v_pessoa.usuario_id],
      'META_DE_VISITA',
      format(
        'Meta de visitas %s: %s',
        case v_pessoa.periodo
          when 'DIARIA' then 'de hoje'
          when 'SEMANAL' then 'da semana'
          when 'QUINZENAL' then 'da quinzena'
          else 'do mês'
        end,
        case when v_pessoa.lugares = 1 then 'falta 1 lugar' else format('faltam %s lugares', v_pessoa.lugares) end
      ),
      left(v_pessoa.resumo || '.', 1000),
      null,
      format('meta:%s:%s', v_pessoa.periodo, v_pessoa.inicio)
    );
  end loop;
  return v_total;
end;
$$;

revoke all on function manutencao.avisar_metas(text[], date) from public, anon, authenticated;
