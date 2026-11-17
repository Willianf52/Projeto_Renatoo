-- ============================================================================
-- 0106: meta de visitas Diaria, Semanal, Quinzenal ou Mensal
--
-- O dono, ao ver a 0105 na previa (17/11/2026): a meta "tem que ser
-- Diario/Semanal/Quinzenal/Mensal", e nao so semanal.
--
-- O que muda:
--   * `metas_semanais` vira `metas_de_visita`, com `periodo` (DIARIA, SEMANAL,
--     QUINZENAL, MENSAL) e `quantidade` (era `visitas_por_semana`). A meta que
--     ja existia continua SEMANAL, com a mesma quantidade.
--   * Uma meta por pessoa, lugar e periodo (a mesma pessoa pode ter 1 por dia
--     e 4 por semana no mesmo lugar).
--   * Os periodos, no fuso de Sao Paulo:
--       DIARIA     o dia;
--       SEMANAL    segunda a domingo;
--       QUINZENAL  1 a 15 e 16 ao fim do mes;
--       MENSAL     o mes.
--   * Continua contando QUALQUER checklist enviado pela pessoa no lugar.
--   * O aviso, so para quem esta abaixo, chega perto do fim do periodo:
--       DIARIA     todo dia as 14:00;
--       SEMANAL    sexta as 08:00 (como na 0105);
--       QUINZENAL  dois dias antes do fim (dia 13 e antepenultimo do mes), 08:00;
--       MENSAL     tres dias antes do fim do mes, 08:00.
--
-- Nada disso ja estava em uso alem da previa: so uma meta cadastrada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabela: novo nome, periodo e quantidade
-- ---------------------------------------------------------------------------
alter table public.metas_semanais rename to metas_de_visita;
alter table public.metas_de_visita rename column visitas_por_semana to quantidade;
alter table public.metas_de_visita rename constraint metas_semanais_pkey to metas_de_visita_pkey;
alter table public.metas_de_visita rename constraint metas_semanais_site_id_fkey to metas_de_visita_site_id_fkey;
alter table public.metas_de_visita rename constraint metas_semanais_usuario_id_fkey to metas_de_visita_usuario_id_fkey;
alter table public.metas_de_visita rename constraint metas_semanais_visitas_por_semana_check to metas_de_visita_quantidade_check;
alter index public.metas_semanais_site_idx rename to metas_de_visita_site_idx;

alter table public.metas_de_visita
  add column if not exists periodo text not null default 'SEMANAL'
  check (periodo in ('DIARIA', 'SEMANAL', 'QUINZENAL', 'MENSAL'));

-- Uma meta por pessoa, lugar e periodo (era por pessoa e lugar).
alter table public.metas_de_visita drop constraint metas_semanais_unica;
alter table public.metas_de_visita
  add constraint metas_de_visita_unica unique (usuario_id, site_id, periodo);

-- Mensal pede numero maior que o semanal.
alter table public.metas_de_visita drop constraint metas_de_visita_quantidade_check;
alter table public.metas_de_visita
  add constraint metas_de_visita_quantidade_check check (quantidade between 1 and 200);

comment on table public.metas_de_visita is
  'Meta de visitas por pessoa e lugar, por periodo (diaria, semanal, quinzenal, mensal; fuso de Sao Paulo); conta qualquer checklist enviado. Pedido do gestor, 0105/0106.';

-- Grants por coluna acompanham o nome novo da coluna, mas `periodo` e nova.
revoke insert, update on public.metas_de_visita from authenticated;
grant insert (usuario_id, site_id, periodo, quantidade, ativo) on public.metas_de_visita to authenticated;
grant update (quantidade, ativo) on public.metas_de_visita to authenticated;

alter policy metas_semanais_ler on public.metas_de_visita rename to metas_de_visita_ler;
alter policy metas_semanais_criar on public.metas_de_visita rename to metas_de_visita_criar;
alter policy metas_semanais_editar on public.metas_de_visita rename to metas_de_visita_editar;
alter policy metas_semanais_apagar on public.metas_de_visita rename to metas_de_visita_apagar;

-- ---------------------------------------------------------------------------
-- O periodo que contem um dia: [inicio, fim)
-- ---------------------------------------------------------------------------
drop function if exists public.progresso_das_metas_semanais(date);
drop function if exists public.inicio_da_semana(date);
drop function if exists manutencao.avisar_metas_da_semana(date);

create or replace function public.periodo_da_meta(p_periodo text, p_dia date)
returns table (inicio date, fim date)
language sql
immutable
set search_path = public, pg_temp
as $$
  with m as (select date_trunc('month', p_dia::timestamp)::date as mes)
  select
    case p_periodo
      when 'DIARIA' then p_dia
      -- date_trunc('week') e ISO: a semana comeca na segunda.
      when 'SEMANAL' then date_trunc('week', p_dia::timestamp)::date
      when 'QUINZENAL' then case when extract(day from p_dia) <= 15 then m.mes else m.mes + 15 end
      when 'MENSAL' then m.mes
    end,
    case p_periodo
      when 'DIARIA' then p_dia + 1
      when 'SEMANAL' then date_trunc('week', p_dia::timestamp)::date + 7
      when 'QUINZENAL' then case when extract(day from p_dia) <= 15 then m.mes + 15 else (m.mes + interval '1 month')::date end
      when 'MENSAL' then (m.mes + interval '1 month')::date
    end
  from m;
$$;

comment on function public.periodo_da_meta(text, date) is
  'Inicio (inclusive) e fim (exclusive) do periodo da meta que contem o dia: DIARIA, SEMANAL (segunda a domingo), QUINZENAL (1-15, 16-fim) ou MENSAL. 0106.';

-- ---------------------------------------------------------------------------
-- Progresso: feitas/meta do periodo corrente de cada meta ativa visivel
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
  cross join lateral public.periodo_da_meta(
    m.periodo, coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date)
  ) p
  where m.ativo;
$$;

comment on function public.progresso_das_metas(date) is
  'Feitas/meta do periodo corrente de cada meta ativa que quem pergunta enxerga; conta qualquer checklist enviado pela pessoa no lugar. Security invoker. 0106.';

revoke all on function public.progresso_das_metas(date) from public, anon;
grant execute on function public.progresso_das_metas(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso perto do fim do periodo, so para quem esta abaixo
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
        -- O dia do aviso de cada periodo (ver o cabecalho).
        case m.periodo
          when 'DIARIA' then p.inicio
          when 'SEMANAL' then p.inicio + 4
          when 'QUINZENAL' then p.fim - 3
          when 'MENSAL' then p.fim - 4
        end as dia_do_aviso
      from public.metas_de_visita m
      cross join lateral public.periodo_da_meta(m.periodo, v_dia) p
      join public.sites s on s.id = m.site_id
      join public.profiles pr on pr.id = m.usuario_id and pr.ativo
      where m.ativo and m.periodo = any (p_periodos)
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('avisar-metas-da-semana', 'avisar-metas-periodos', 'avisar-metas-do-dia');
    -- 08:00 em Sao Paulo (11:00 UTC): semanal, quinzenal e mensal (cada um so
    -- no seu dia de aviso).
    perform cron.schedule(
      'avisar-metas-periodos',
      '0 11 * * *',
      $cron$select manutencao.avisar_metas(array['SEMANAL', 'QUINZENAL', 'MENSAL'])$cron$
    );
    -- 14:00 em Sao Paulo (17:00 UTC): a meta diaria.
    perform cron.schedule(
      'avisar-metas-do-dia',
      '0 17 * * *',
      $cron$select manutencao.avisar_metas(array['DIARIA'])$cron$
    );
  end if;
end;
$$;
