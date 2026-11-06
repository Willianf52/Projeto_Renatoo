-- ============================================================================
-- 0094 -- "Concluido" no lugar de "Atendido" e exclusao de evento
--
-- Comparado com o sistema de referencia em 06/11/2026:
--
--   1) No Painel de Eventos de la nao existe "Atendido": o estado final de uma
--      ocorrencia finalizada e "Concluido", e o "Status Final" do cadastro do
--      evento oferece Concluido, Cancelado e Nao Realizado. Aqui a finalizacao
--      levava a ATENDIDO. Agora leva a CONCLUIDO (0089 ja aceitava o valor);
--      o que era ATENDIDO vira CONCLUIDO. ATENDIDO continua valido no check
--      (nada mais o produz), para nao quebrar linha antiga que alguem importe.
--
--   2) A lixeira da lista do Cadastro de Eventos: `excluir_evento`. So apaga
--      evento SEM ocorrencia, sem SubTipo e sem pergunta de checklist ligada:
--      o que tem historico nao se apaga, se inativa.
-- ============================================================================

-- 1) Concluido ---------------------------------------------------------------------

update public.ocorrencias set status = 'CONCLUIDO' where status = 'ATENDIDO';
update public.eventos set status_final = 'CONCLUIDO' where status_final = 'ATENDIDO';

alter table public.eventos drop constraint if exists eventos_status_final_check;
alter table public.eventos add constraint eventos_status_final_check
  check (status_final is null or status_final in ('CONCLUIDO', 'CANCELADO', 'NAO_REALIZADO', 'ATENDIDO'));

create or replace function manutencao.andamento_da_ocorrencia_muda_o_status()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_status text;
begin
  -- A permissao vem PRIMEIRO (ver 0064): sem isto quem nao pode receberia
  -- "ja encerrada" em vez de "sem permissao".
  if auth.uid() is not null and not autorizacao.pode_ver_toda_operacao() then
    raise exception 'Sem permissão para registrar andamento.' using errcode = '42501';
  end if;

  select status into v_status from public.ocorrencias where id = new.ocorrencia_id for update;

  if v_status in ('ATENDIDO', 'CANCELADO', 'CONCLUIDO', 'NAO_REALIZADO') then
    raise exception 'Ocorrência já encerrada (%).', v_status using errcode = '23514';
  end if;

  -- Troca escolhida no Quadro (0089): vale o status pedido.
  if new.status_novo is not null then
    update public.ocorrencias
       set status = new.status_novo,
           finalizada_em = case
             when new.status_novo in ('ATENDIDO', 'CANCELADO', 'CONCLUIDO', 'NAO_REALIZADO') then new.criado_em
             else finalizada_em
           end
     where id = new.ocorrencia_id;
    return new;
  end if;

  if new.tipo = 'ANALISE' then
    if v_status = 'AGUARDANDO' then
      update public.ocorrencias set status = 'EM_ANALISE' where id = new.ocorrencia_id;
    end if;
  else
    -- Finalizar agora leva a CONCLUIDO, como o Painel do sistema de referencia.
    update public.ocorrencias
       set status = 'CONCLUIDO', finalizada_em = new.criado_em
     where id = new.ocorrencia_id;
  end if;

  return new;
end;
$$;

create or replace function manutencao.finalizar_ocorrencias_vencidas()
returns integer
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_tipo bigint;
  v_oc record;
  v_quantos integer := 0;
begin
  -- O andamento exige um tipo de analise (0064): o primeiro ativo.
  select id into v_tipo from public.tipos_de_analise where ativo order by id limit 1;
  if v_tipo is null then
    return 0;
  end if;

  for v_oc in
    select o.id, e.status_final, e.usuario_final_id
      from public.ocorrencias o
      join public.eventos e on e.id = o.evento_id
     where o.status in ('AGUARDANDO', 'EM_ANALISE', 'CRITICO', 'PRE_CRITICO', 'ALERTA', 'PANICO')
       and e.finalizacao_automatica
       and e.tempo_finalizacao_minutos is not null
       and o.criado_em + make_interval(mins => e.tempo_finalizacao_minutos) <= now()
     order by o.id
     limit 200
  loop
    begin
      insert into public.ocorrencia_andamentos (ocorrencia_id, tipo, tipo_analise_id, texto, autor_id)
      values (
        v_oc.id, 'FINALIZACAO', v_tipo,
        'Finalizado automaticamente: o tempo para finalização do evento terminou.',
        v_oc.usuario_final_id
      );
      -- O trigger encerra como CONCLUIDO; Cancelado e Nao Realizado sao os outros finais.
      if v_oc.status_final in ('CANCELADO', 'NAO_REALIZADO') then
        update public.ocorrencias set status = v_oc.status_final where id = v_oc.id;
      end if;
      v_quantos := v_quantos + 1;
    exception when others then
      raise warning 'finalizar_ocorrencias_vencidas: ocorrencia % nao finalizada: %', v_oc.id, sqlerrm;
    end;
  end loop;

  return v_quantos;
end;
$$;

-- 2) Excluir evento ----------------------------------------------------------------

create or replace function escrita.excluir_evento(p_evento_id bigint)
returns void
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
begin
  if auth.uid() is null or not autorizacao.pode_administrar_usuarios() then
    raise exception 'Sem permissão para excluir eventos.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.eventos where id = p_evento_id) then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.ocorrencias o where o.evento_id = p_evento_id or o.subevento_id = p_evento_id) then
    raise exception 'Este evento já tem ocorrências registradas e não pode ser excluído. Inative o evento.'
      using errcode = '23503';
  end if;

  if exists (select 1 from public.eventos s where s.superior_id = p_evento_id) then
    raise exception 'Este evento tem SubTipos. Exclua ou mude os SubTipos antes.' using errcode = '23503';
  end if;

  if exists (select 1 from public.leituras l where l.evento_id = p_evento_id) then
    raise exception 'Este evento já foi usado em coletas e não pode ser excluído. Inative o evento.'
      using errcode = '23503';
  end if;

  if exists (select 1 from public.perguntas_checklist p where p.evento_id = p_evento_id) then
    raise exception 'Este evento está ligado a perguntas de checklist. Troque o evento delas antes.'
      using errcode = '23503';
  end if;

  -- Sites, e-mails e permissoes saem em cascata (FKs on delete cascade).
  delete from public.eventos where id = p_evento_id;
end;
$$;

comment on function escrita.excluir_evento(bigint) is
  'Lixeira do Cadastro de Eventos: so apaga evento sem ocorrencia, sem SubTipo e sem pergunta de checklist ligada. Migration 0094.';

revoke all on function escrita.excluir_evento(bigint) from public, anon;
grant execute on function escrita.excluir_evento(bigint) to authenticated;

create or replace function public.excluir_evento(p_evento_id bigint)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.excluir_evento(p_evento_id);
$$;

comment on function public.excluir_evento(bigint) is 'Envelope de escrita.excluir_evento -- migration 0094.';

revoke all on function public.excluir_evento(bigint) from public, anon;
grant execute on function public.excluir_evento(bigint) to authenticated;
