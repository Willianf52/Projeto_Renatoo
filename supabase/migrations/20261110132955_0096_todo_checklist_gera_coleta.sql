-- ============================================================================
-- 0096: todo checklist enviado gera coleta (Inicio e Termino)
--
-- POR QUE EXISTE (10/11/2026): o dono viu que os checklists de hoje nao
-- apareciam em Coletas Importadas. A coleta so nascia da leitura de QR: um
-- checklist feito sem ler o QR ("Ver sites" no app, ou "Responder Novo
-- Checklist" no portal) cria a visita no envio, sem leitura nenhuma, e a 0077
-- so gravava o Termino em visita que ja tinha leitura. No sistema antigo todo
-- checklist do dia tem o par "Inicio" e "Termino" em Coletas Importadas.
--
-- Agora, no envio do checklist:
--   - visita COM leitura (ronda com QR): so o Termino, como na 0077;
--   - visita SEM leitura: grava o "Inicio" (quando a visita comecou) e o
--     "Termino" (hora do checklist), as duas areas que as coletas importadas
--     ja usam e que `visitas_do_periodo` ja reconhece (inicio pela area
--     "Inicio", fim pela "Termino").
--
-- E preenche as visitas que ja tem checklist e nenhuma leitura, com o mesmo
-- par, para aparecerem em Coletas Importadas e nos relatorios.
-- ============================================================================

create or replace function manutencao.termino_pelo_checklist()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $function$
declare
  v_inicio  bigint := (select a.id from public.areas a where a.nome = 'Início');
  v_termino bigint := (select a.id from public.areas a where a.nome = 'Término');
  v_comeco  timestamptz;
begin
  if v_termino is null then
    return null;
  end if;

  -- Checklist sem leitura de QR: a visita ganha o Inicio, como no antigo.
  if not exists (select 1 from public.leituras l where l.visita_id = new.visita_id) then
    if v_inicio is null then
      return null;
    end if;

    select least(v.criado_em, new.criado_em) into v_comeco
      from public.visitas v
     where v.id = new.visita_id;

    insert into public.leituras (visita_id, area_id, data_hora)
    values (new.visita_id, v_inicio, coalesce(v_comeco, new.criado_em))
    on conflict do nothing;
  end if;

  insert into public.leituras (visita_id, area_id, data_hora)
  values (new.visita_id, v_termino, new.criado_em)
  on conflict do nothing;
  return null;
end;
$function$;

-- As visitas que ja tem checklist e nenhuma leitura ganham o mesmo par.
-- O CTE congela a lista antes do insert, para o Termino nao depender do
-- Inicio que acabou de entrar.
with alvo as (
  select v.id as visita_id,
         least(v.criado_em, c.primeiro) as comeco,
         c.ultimo as fim
    from public.visitas v
    join (select visita_id, min(criado_em) as primeiro, max(criado_em) as ultimo
            from public.checklists_visita
           group by visita_id) c on c.visita_id = v.id
   where not exists (select 1 from public.leituras l where l.visita_id = v.id)
)
insert into public.leituras (visita_id, area_id, data_hora)
select a.visita_id, (select id from public.areas where nome = 'Início'), a.comeco from alvo a
union all
select a.visita_id, (select id from public.areas where nome = 'Término'), a.fim from alvo a
on conflict do nothing;
