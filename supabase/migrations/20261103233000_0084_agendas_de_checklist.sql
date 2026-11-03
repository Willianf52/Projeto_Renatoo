-- ============================================================================
-- 0084 -- Agendas de checklist ("Criar Agenda" e "Agendamentos")
--
-- O ChecklistLab do sistema de referencia agenda checklists: uma agenda diz
-- QUAL checklist, EM QUAIS sites, de QUANTO em QUANTO tempo (Diario a Anual),
-- entre quais datas, com que tolerancia e de quem e a responsabilidade. Cada
-- data gerada pela recorrencia, em cada site, e um "agendamento", com status
-- Agendado, No prazo, Atrasado ou Finalizado.
--
-- Aqui os agendamentos NAO sao gravados: saem da recorrencia, na leitura
-- (`agendamentos_do_periodo`). O status vem do que aconteceu em campo: um
-- checklist do mesmo modelo, no mesmo site, entre a data planejada e o fim
-- da tolerancia, finaliza o agendamento. Assim o app de campo nao muda, e
-- editar a agenda reflete na hora em todos os agendamentos.
--
-- Leitura: quem ve toda a operacao. Escrita: quem administra cadastros.
-- ============================================================================

create table if not exists public.agendas (
  id bigint generated always as identity primary key,
  nome text not null,
  modelo_id bigint not null references public.modelos_checklist (id),
  responsavel_id uuid references public.profiles (id) on delete set null,
  grupo_usuario_id bigint references public.grupos_usuarios (id) on delete set null,
  data_inicial date not null,
  data_final date not null,
  recorrencia text not null,
  tolerancia_dias integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint agendas_nome_check check (length(btrim(nome)) between 1 and 100),
  constraint agendas_periodo_check check (data_final >= data_inicial and data_final <= data_inicial + 1830),
  constraint agendas_recorrencia_check check (recorrencia in (
    'DIARIO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'
  )),
  constraint agendas_tolerancia_check check (tolerancia_dias between 0 and 365)
);

comment on table public.agendas is
  'Agenda de checklist ("Criar Agenda" do sistema de referencia). Os agendamentos saem da recorrencia na leitura. Ver 0084.';

create table if not exists public.agenda_sites (
  agenda_id bigint not null references public.agendas (id) on delete cascade,
  site_id bigint not null references public.sites (id) on delete cascade,
  primary key (agenda_id, site_id)
);

create index if not exists agenda_sites_site_idx on public.agenda_sites (site_id);

alter table public.agendas enable row level security;
alter table public.agenda_sites enable row level security;

revoke all on public.agendas, public.agenda_sites from anon, authenticated;
grant select, insert, update, delete on public.agendas to authenticated;
grant select, insert, delete on public.agenda_sites to authenticated;
grant all on public.agendas, public.agenda_sites to service_role;

drop policy if exists "Gestao le agendas" on public.agendas;
create policy "Gestao le agendas" on public.agendas
  for select to authenticated using ((select autorizacao.pode_ver_toda_operacao()));

drop policy if exists "Cadastro escreve agendas" on public.agendas;
create policy "Cadastro escreve agendas" on public.agendas
  for all to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists "Gestao le sites da agenda" on public.agenda_sites;
create policy "Gestao le sites da agenda" on public.agenda_sites
  for select to authenticated using ((select autorizacao.pode_ver_toda_operacao()));

drop policy if exists "Cadastro escreve sites da agenda" on public.agenda_sites;
create policy "Cadastro escreve sites da agenda" on public.agenda_sites
  for all to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

-- Salvar agenda e sites numa transacao so (mesmo molde do salvar_evento, 0072).
create or replace function public.salvar_agenda(
  p_id bigint,
  p_nome text,
  p_modelo_id bigint,
  p_responsavel_id uuid,
  p_grupo_usuario_id bigint,
  p_data_inicial date,
  p_data_final date,
  p_recorrencia text,
  p_tolerancia_dias integer,
  p_ativo boolean,
  p_sites bigint[]
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  if coalesce(cardinality(p_sites), 0) = 0 then
    raise exception 'Escolha ao menos um site.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.agendas (nome, modelo_id, responsavel_id, grupo_usuario_id, data_inicial, data_final,
                                recorrencia, tolerancia_dias, ativo)
    values (btrim(p_nome), p_modelo_id, p_responsavel_id, p_grupo_usuario_id, p_data_inicial, p_data_final,
            p_recorrencia, coalesce(p_tolerancia_dias, 0), coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.agendas
       set nome = btrim(p_nome), modelo_id = p_modelo_id, responsavel_id = p_responsavel_id,
           grupo_usuario_id = p_grupo_usuario_id, data_inicial = p_data_inicial, data_final = p_data_final,
           recorrencia = p_recorrencia, tolerancia_dias = coalesce(p_tolerancia_dias, 0),
           ativo = coalesce(p_ativo, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Agenda inexistente ou sem permissão.' using errcode = '42501';
    end if;
  end if;

  delete from public.agenda_sites s where s.agenda_id = v_id and not (s.site_id = any (p_sites));
  insert into public.agenda_sites (agenda_id, site_id)
  select v_id, unnest(p_sites)
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.salvar_agenda(bigint, text, bigint, uuid, bigint, date, date, text, integer, boolean, bigint[]) from public, anon;
grant execute on function public.salvar_agenda(bigint, text, bigint, uuid, bigint, date, date, text, integer, boolean, bigint[]) to authenticated;

-- Os agendamentos de um periodo, com o status calculado. security invoker: o
-- RLS de agendas (so a gestao le) recorta; quem nao ve, recebe vazio.
create or replace function public.agendamentos_do_periodo(p_inicio date, p_fim date)
returns table (
  agenda_id bigint,
  agenda text,
  modelo_id bigint,
  modelo text,
  site_id bigint,
  data_planejada date,
  prazo date,
  responsavel_id uuid,
  grupo_usuario_id bigint,
  checklist_id bigint,
  realizado_em timestamptz,
  status text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with datas as (
    select a.*, d::date as data_planejada
      from public.agendas a
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
  )
  select d.id, d.nome, d.modelo_id, m.nome, s.site_id, d.data_planejada,
         (d.data_planejada + d.tolerancia_dias) as prazo,
         d.responsavel_id, d.grupo_usuario_id,
         c.id, c.criado_em,
         case
           when c.id is not null then 'FINALIZADO'
           when (now() at time zone 'America/Sao_Paulo')::date < d.data_planejada then 'AGENDADO'
           when (now() at time zone 'America/Sao_Paulo')::date <= d.data_planejada + d.tolerancia_dias then 'NO_PRAZO'
           else 'ATRASADO'
         end
    from datas d
    join public.modelos_checklist m on m.id = d.modelo_id
    join public.agenda_sites s on s.agenda_id = d.id
    left join lateral (
      select cv.id, cv.criado_em
        from public.checklists_visita cv
        join public.visitas v on v.id = cv.visita_id
       where cv.modelo_id = d.modelo_id
         and v.site_id = s.site_id
         and (cv.criado_em at time zone 'America/Sao_Paulo')::date
             between d.data_planejada and d.data_planejada + d.tolerancia_dias
       order by cv.criado_em
       limit 1
    ) c on true
   where d.data_planejada between p_inicio and p_fim
   order by d.data_planejada, d.nome, s.site_id;
$$;

comment on function public.agendamentos_do_periodo(date, date) is
  'Agendamentos (data planejada x site) das agendas ativas no periodo, com o status: FINALIZADO quando ha
   checklist do modelo no site dentro da tolerancia, senao AGENDADO, NO_PRAZO ou ATRASADO. Ver 0084.';

revoke all on function public.agendamentos_do_periodo(date, date) from public, anon;
grant execute on function public.agendamentos_do_periodo(date, date) to authenticated;
