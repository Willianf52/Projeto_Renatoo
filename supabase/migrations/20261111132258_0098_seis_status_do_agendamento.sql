-- ============================================================================
-- 0098: os 6 status do agendamento, como no sistema antigo
--
-- POR QUE EXISTE (11/11/2026): o calendario de Agendamentos do antigo tem 6
-- status na legenda; o novo tinha 4. A regra dos dois que faltavam foi
-- aprovada pelo dono em 11/11:
--
--   - FINALIZADO: checklist do modelo no site ate o prazo (data planejada +
--     tolerancia);
--   - FINALIZADO_COM_ATRASO: checklist depois do prazo, antes da proxima data
--     da agenda;
--   - AGENDADO: a data planejada ainda nao chegou;
--   - NO_PRAZO: entre a data planejada e o prazo, sem checklist;
--   - ATRASADO: o prazo passou, sem checklist, e a proxima data ainda nao
--     chegou (ainda da para fazer);
--   - NAO_REALIZADO: chegou a proxima data da agenda (ou a agenda terminou)
--     sem checklist.
--
-- A "janela" de cada data vai da data planejada ate a vespera da proxima
-- (data planejada + o passo da recorrencia); se a tolerancia for maior que o
-- passo, a janela vai ate o prazo. Antes da 0098 o checklist so contava ate o
-- prazo, e um feito com atraso deixava a data ATRASADA para sempre.
--
-- Mesma assinatura e mesmas permissoes da 0084: so muda o corpo.
-- ============================================================================

create or replace function public.agendamentos_do_periodo(p_inicio date, p_fim date)
returns table(
  agenda_id bigint, agenda text, modelo_id bigint, modelo text, site_id bigint,
  data_planejada date, prazo date, responsavel_id uuid, grupo_usuario_id bigint,
  checklist_id bigint, realizado_em timestamp with time zone, status text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with datas as (
    select a.*, d::date as data_planejada, p.passo
      from public.agendas a
     cross join lateral (
       select case a.recorrencia
                when 'DIARIO' then interval '1 day'
                when 'SEMANAL' then interval '7 days'
                when 'QUINZENAL' then interval '14 days'
                when 'MENSAL' then interval '1 month'
                when 'BIMESTRAL' then interval '2 months'
                when 'TRIMESTRAL' then interval '3 months'
                when 'SEMESTRAL' then interval '6 months'
                else interval '1 year'
              end as passo
     ) p
     cross join lateral generate_series(a.data_inicial::timestamp, a.data_final::timestamp, p.passo) as d
     where a.ativo
  ),
  janelas as (
    select d.*,
           d.data_planejada + d.tolerancia_dias as prazo_dia,
           -- A vespera da proxima data, ou o prazo, o que vier depois.
           greatest((d.data_planejada + d.passo)::date, d.data_planejada + d.tolerancia_dias + 1) as fim_da_janela
      from datas d
  ),
  hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as dia
  )
  select j.id, j.nome, j.modelo_id, m.nome, s.site_id, j.data_planejada,
         j.prazo_dia as prazo,
         j.responsavel_id, j.grupo_usuario_id,
         c.id, c.criado_em,
         case
           when c.id is not null and (c.criado_em at time zone 'America/Sao_Paulo')::date <= j.prazo_dia then 'FINALIZADO'
           when c.id is not null then 'FINALIZADO_COM_ATRASO'
           when h.dia < j.data_planejada then 'AGENDADO'
           when h.dia <= j.prazo_dia then 'NO_PRAZO'
           when h.dia < j.fim_da_janela then 'ATRASADO'
           else 'NAO_REALIZADO'
         end
    from janelas j
   cross join hoje h
    join public.modelos_checklist m on m.id = j.modelo_id
    join public.agenda_sites s on s.agenda_id = j.id
    left join lateral (
      select cv.id, cv.criado_em
        from public.checklists_visita cv
        join public.visitas v on v.id = cv.visita_id
       where cv.modelo_id = j.modelo_id
         and v.site_id = s.site_id
         and (cv.criado_em at time zone 'America/Sao_Paulo')::date >= j.data_planejada
         and (cv.criado_em at time zone 'America/Sao_Paulo')::date < j.fim_da_janela
       order by cv.criado_em
       limit 1
    ) c on true
   where j.data_planejada between p_inicio and p_fim
   order by j.data_planejada, j.nome, s.site_id;
$function$;

comment on function public.agendamentos_do_periodo(date, date) is
  'Agendamentos (data planejada x site) das agendas ativas no periodo, com os 6 status do sistema antigo (0098):
   FINALIZADO, FINALIZADO_COM_ATRASO, AGENDADO, NO_PRAZO, ATRASADO e NAO_REALIZADO. Ver 0084 e 0098.';
