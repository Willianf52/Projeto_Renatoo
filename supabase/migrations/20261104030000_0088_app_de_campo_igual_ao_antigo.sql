-- ============================================================================
-- 0088 -- App de campo igual ao do sistema de referencia
--
-- Tres pecas que o app antigo tem e o novo nao tinha, vistas lado a lado no
-- aparelho em 03/11/2026:
--
--   1) "Checklists agendados": o app lista os agendamentos das agendas (0084).
--      As agendas so eram legiveis por GESTOR e SUPERVISOR; agora todo usuario
--      ativo que nao e CLIENTE le, o mesmo criterio da 0075 para as coletas.
--      `agendamentos_do_periodo` e security invoker, entao passa a funcionar
--      para o inspetor sem mudar a funcao.
--
--   2) "Abandonar Inspecao": o inspetor desiste de uma visita aberta por
--      engano. Apaga a visita (e, por cascata, as leituras) SO quando ela e
--      dele, sem checklist e criada nos ultimos 2 dias -- visita com checklist
--      e registro de campo e nao se desfaz pelo app. Funcao definer em
--      `escrita` (o inspetor nao tem DELETE em visitas, de proposito) com o
--      envelope invoker em public, a regra da 0050.
--
--   3) Localizacao: o app antigo grava latitude e longitude no inicio e no fim
--      da visita, e o portal mostra no mapa. `leituras.tem_localizacao` ja
--      existia sem as coordenadas; agora elas vem junto.
-- ============================================================================

-- 1) Agendas legiveis pelo campo -------------------------------------------------

drop policy if exists "Campo le agendas" on public.agendas;
create policy "Campo le agendas" on public.agendas
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop policy if exists "Campo le sites da agenda" on public.agenda_sites;
create policy "Campo le sites da agenda" on public.agenda_sites
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

-- 2) Abandonar inspecao ----------------------------------------------------------

create or replace function escrita.abandonar_visita(p_visita_id bigint)
returns void
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
declare
  v_quem uuid := auth.uid();
begin
  if v_quem is null or not autorizacao.usuario_ativo() then
    raise exception 'Sem permissão para abandonar esta inspeção.' using errcode = '42501';
  end if;

  if exists (select 1 from public.checklists_visita c where c.visita_id = p_visita_id) then
    raise exception 'Esta inspeção já tem checklist enviado e não pode ser abandonada.' using errcode = '42501';
  end if;

  delete from public.visitas v
   where v.id = p_visita_id
     and v.funcionario_id = v_quem
     and v.criado_em > now() - interval '2 days';

  if not found then
    raise exception 'Inspeção não encontrada, de outra pessoa ou antiga demais para abandonar.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function escrita.abandonar_visita(bigint) is
  '"Abandonar Inspecao" do app: apaga a visita do proprio inspetor, sem checklist, dos ultimos 2 dias. Migration 0088.';

revoke all on function escrita.abandonar_visita(bigint) from public, anon;
grant execute on function escrita.abandonar_visita(bigint) to authenticated;

create or replace function public.abandonar_visita(p_visita_id bigint)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.abandonar_visita(p_visita_id);
$$;

comment on function public.abandonar_visita(bigint) is
  'Envelope de escrita.abandonar_visita -- migration 0088.';

revoke all on function public.abandonar_visita(bigint) from public, anon;
grant execute on function public.abandonar_visita(bigint) to authenticated;

-- 3) Coordenadas da leitura ------------------------------------------------------

alter table public.leituras
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists precisao_metros real;

-- Insert por coluna desde a 0054: as novas entram na lista do app.
grant insert (latitude, longitude, precisao_metros) on public.leituras to authenticated;

alter table public.leituras drop constraint if exists leituras_coordenadas_check;
alter table public.leituras add constraint leituras_coordenadas_check check (
  (latitude is null and longitude is null)
  or (latitude between -90 and 90 and longitude between -180 and 180)
);

comment on column public.leituras.latitude is 'Latitude do aparelho na leitura (GPS), quando o inspetor permitiu. Migration 0088.';
comment on column public.leituras.longitude is 'Longitude do aparelho na leitura (GPS), quando o inspetor permitiu. Migration 0088.';
comment on column public.leituras.precisao_metros is 'Precisao informada pelo GPS, em metros. Migration 0088.';
