-- ============================================================================
-- 0105: meta semanal de visitas por inspetor e lugar, com aviso de sexta
--
-- Pedido do gestor (16/11/2026, autorizado em 17/11): o "1/4 (sem)" da folha
-- e uma meta POR INSPETOR e POR LUGAR: 4 visitas na semana naquele lugar,
-- mostrando feitas/meta (1 de 4).
--
-- Decisoes do dono:
--   * Semana de segunda a domingo (fuso de Sao Paulo).
--   * Conta QUALQUER checklist enviado pelo inspetor naquele lugar na semana
--     (17/11).
--   * Aviso na sexta de manha, so para quem esta abaixo da meta, pela caixa
--     de notificacoes (0103), no portal e no app.
--
-- Nao confundir com `metas_visitas` (0004): aquela e por site e por MES, so
-- para o relatorio de Visitas de Supervisao. Esta e por pessoa e por semana.
--
-- Regras:
--   * Quem administra cadastros (GESTOR, SUPERVISOR, OPERACIONAL) cria, edita
--     e apaga metas e ve todas; cada pessoa ve as proprias.
--   * O progresso (`progresso_das_metas_semanais`) e security invoker: conta
--     so os checklists que quem pergunta enxerga (o inspetor, os dele).
-- ============================================================================

create table if not exists public.metas_semanais (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  site_id bigint not null references public.sites (id) on delete cascade,
  visitas_por_semana integer not null check (visitas_por_semana between 1 and 21),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint metas_semanais_unica unique (usuario_id, site_id)
);

comment on table public.metas_semanais is
  'Meta de visitas por pessoa e lugar, por semana (segunda a domingo); conta qualquer checklist enviado. Pedido do gestor, 0105.';

create index if not exists metas_semanais_site_idx on public.metas_semanais (site_id);

alter table public.metas_semanais enable row level security;

revoke all on public.metas_semanais from anon, authenticated;
grant select, delete on public.metas_semanais to authenticated;
grant insert (usuario_id, site_id, visitas_por_semana, ativo) on public.metas_semanais to authenticated;
grant update (visitas_por_semana, ativo) on public.metas_semanais to authenticated;

drop policy if exists metas_semanais_ler on public.metas_semanais;
create policy metas_semanais_ler on public.metas_semanais
  for select to authenticated
  using (
    (select autorizacao.pode_administrar_cadastros())
    or ((select autorizacao.usuario_ativo()) and usuario_id = (select auth.uid()))
  );

drop policy if exists metas_semanais_criar on public.metas_semanais;
create policy metas_semanais_criar on public.metas_semanais
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists metas_semanais_editar on public.metas_semanais;
create policy metas_semanais_editar on public.metas_semanais
  for update to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists metas_semanais_apagar on public.metas_semanais;
create policy metas_semanais_apagar on public.metas_semanais
  for delete to authenticated
  using ((select autorizacao.pode_administrar_cadastros()));

drop trigger if exists auditoria_trigger on public.metas_semanais;
create trigger auditoria_trigger
  after insert or update or delete on public.metas_semanais
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- A semana (segunda a domingo, Sao Paulo) que contem um dia
-- ---------------------------------------------------------------------------
create or replace function public.inicio_da_semana(p_dia date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  -- date_trunc('week') e ISO: a semana comeca na segunda.
  select date_trunc('week', p_dia::timestamp)::date;
$$;

-- ---------------------------------------------------------------------------
-- Progresso: feitas/meta de cada meta ativa visivel a quem pergunta
-- ---------------------------------------------------------------------------
create or replace function public.progresso_das_metas_semanais(p_dia date default null)
returns table (
  meta_id bigint,
  usuario_id uuid,
  site_id bigint,
  visitas_por_semana integer,
  feitas integer,
  semana_inicio date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with semana as (
    select public.inicio_da_semana(coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date)) as inicio
  )
  select
    m.id,
    m.usuario_id,
    m.site_id,
    m.visitas_por_semana,
    (
      select count(*)::integer
        from public.checklists_visita c
        join public.visitas v on v.id = c.visita_id
       where v.site_id = m.site_id
         and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
         and c.criado_em >= (s.inicio::timestamp at time zone 'America/Sao_Paulo')
         and c.criado_em < ((s.inicio + 7)::timestamp at time zone 'America/Sao_Paulo')
    ) as feitas,
    s.inicio
  from public.metas_semanais m
  cross join semana s
  where m.ativo;
$$;

comment on function public.progresso_das_metas_semanais(date) is
  'Feitas/meta da semana (segunda a domingo, Sao Paulo) de cada meta ativa que quem pergunta enxerga; conta qualquer checklist enviado pela pessoa no lugar. Security invoker. 0105.';

revoke all on function public.progresso_das_metas_semanais(date) from public, anon;
grant execute on function public.progresso_das_metas_semanais(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso de sexta de manha: so quem esta abaixo da meta
-- ---------------------------------------------------------------------------
create or replace function manutencao.avisar_metas_da_semana(p_dia date default null)
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_inicio date := public.inicio_da_semana(v_dia);
  v_pessoa record;
  v_total integer := 0;
begin
  for v_pessoa in
    with progresso as (
      select
        m.usuario_id,
        s.nome as site_nome,
        m.visitas_por_semana as meta,
        (
          select count(*)::integer
            from public.checklists_visita c
            join public.visitas v on v.id = c.visita_id
           where v.site_id = m.site_id
             and coalesce(c.enviado_por, v.funcionario_id) = m.usuario_id
             and c.criado_em >= (v_inicio::timestamp at time zone 'America/Sao_Paulo')
             and c.criado_em < ((v_inicio + 7)::timestamp at time zone 'America/Sao_Paulo')
        ) as feitas
      from public.metas_semanais m
      join public.sites s on s.id = m.site_id
      join public.profiles p on p.id = m.usuario_id and p.ativo
      where m.ativo
    )
    select
      usuario_id,
      count(*) as lugares,
      string_agg(format('%s: %s de %s', site_nome, feitas, meta), '; ' order by site_nome) as resumo
    from progresso
    where feitas < meta
    group by usuario_id
  loop
    v_total := v_total + manutencao.notificar(
      array[v_pessoa.usuario_id],
      'META_DA_SEMANA',
      case when v_pessoa.lugares = 1
        then 'Meta de visitas da semana: falta 1 lugar'
        else format('Meta de visitas da semana: faltam %s lugares', v_pessoa.lugares)
      end,
      left(v_pessoa.resumo || '. A semana termina no domingo.', 1000),
      null,
      format('meta:%s', v_inicio)
    );
  end loop;
  return v_total;
end;
$$;

revoke all on function manutencao.avisar_metas_da_semana(date) from public, anon, authenticated;

-- Sexta, 08:00 em Sao Paulo (11:00 UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'avisar-metas-da-semana';
    perform cron.schedule(
      'avisar-metas-da-semana',
      '0 11 * * 5',
      $cron$select manutencao.avisar_metas_da_semana()$cron$
    );
  end if;
end;
$$;
