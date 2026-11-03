-- ============================================================================
-- 0083 -- Cadastro de Eventos com os campos do sistema de referencia
--
-- O "Cadastro de Eventos" do antigo tem, alem do que a 0072 trouxe:
--   - Tempo para Finalizacao, com o Status final e o Usuario final;
--   - Responsavel pelo atendimento, "Enviar ao superior imediato" e
--     E-mails (copia); Tempo de Prorrogacao de Atendimento;
--   - "E alarme?", "Finalizacao automatica?", "Finalizacao pela Ocorrencia
--     (no inicio)?", NPS, Tipo de Classificacao padrao e Grupo Responsavel;
--   - "Alterar Eventos": permissoes em massa (Grupo Responsavel e Sites),
--     mantendo as atuais e adicionando, ou removendo as antigas.
--
-- "Finalizacao automatica" FUNCIONA: a cada 10 minutos (pg_cron) as
-- ocorrencias abertas de evento com a opcao marcada e com o Tempo para
-- Finalizacao vencido recebem uma finalizacao automatica, em nome do
-- Usuario final, com o Status final (Atendido ou Cancelado). Os demais
-- campos ficam gravados como no antigo.
--
-- Tudo aditivo: colunas novas com default; nenhum evento muda de
-- comportamento ate alguem marcar a opcao.
-- ============================================================================

-- 1) Colunas -------------------------------------------------------------------------

alter table public.eventos
  add column if not exists tempo_finalizacao_minutos integer,
  add column if not exists status_final text,
  add column if not exists usuario_final_id uuid references public.profiles (id) on delete set null,
  add column if not exists responsavel_atendimento_id uuid references public.profiles (id) on delete set null,
  add column if not exists enviar_superior_imediato boolean not null default false,
  add column if not exists emails_copia text[] not null default '{}',
  add column if not exists prorrogacao_minutos integer,
  add column if not exists alarme boolean not null default false,
  add column if not exists finalizacao_automatica boolean not null default false,
  add column if not exists finalizacao_pela_ocorrencia_inicio boolean not null default false,
  add column if not exists nps text,
  add column if not exists tipo_classificacao_id bigint references public.tipos_de_classificacao (id) on delete set null,
  add column if not exists grupo_responsavel_id bigint references public.grupos_usuarios (id) on delete set null;

alter table public.eventos drop constraint if exists eventos_tempo_finalizacao_check;
alter table public.eventos
  add constraint eventos_tempo_finalizacao_check
  check (tempo_finalizacao_minutos is null or tempo_finalizacao_minutos between 1 and 525600);

alter table public.eventos drop constraint if exists eventos_prorrogacao_check;
alter table public.eventos
  add constraint eventos_prorrogacao_check
  check (prorrogacao_minutos is null or prorrogacao_minutos between 1 and 525600);

alter table public.eventos drop constraint if exists eventos_status_final_check;
alter table public.eventos
  add constraint eventos_status_final_check check (status_final is null or status_final in ('ATENDIDO', 'CANCELADO'));

alter table public.eventos drop constraint if exists eventos_nps_check;
alter table public.eventos
  add constraint eventos_nps_check check (nps is null or nps in ('POSITIVO', 'NEUTRO', 'NEGATIVO'));

alter table public.eventos drop constraint if exists eventos_emails_copia_validos;
alter table public.eventos
  add constraint eventos_emails_copia_validos
  check (cardinality(emails_copia) <= 20 and public.lista_de_emails_valida(emails_copia));

-- Finalizacao automatica precisa saber quando: sem tempo, a opcao nao vale.
alter table public.eventos drop constraint if exists eventos_finalizacao_automatica_check;
alter table public.eventos
  add constraint eventos_finalizacao_automatica_check
  check (not finalizacao_automatica or tempo_finalizacao_minutos is not null);

grant insert (tempo_finalizacao_minutos, status_final, usuario_final_id, responsavel_atendimento_id,
              enviar_superior_imediato, emails_copia, prorrogacao_minutos, alarme, finalizacao_automatica,
              finalizacao_pela_ocorrencia_inicio, nps, tipo_classificacao_id, grupo_responsavel_id),
      update (tempo_finalizacao_minutos, status_final, usuario_final_id, responsavel_atendimento_id,
              enviar_superior_imediato, emails_copia, prorrogacao_minutos, alarme, finalizacao_automatica,
              finalizacao_pela_ocorrencia_inicio, nps, tipo_classificacao_id, grupo_responsavel_id)
   on public.eventos to authenticated;

-- 2) salvar_evento com os campos novos -----------------------------------------------
-- Parametros novos no fim e com default: quem chamava com os nove de antes
-- continua chamando. A assinatura antiga sai para nao sobrar sobrecarga.

drop function if exists public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[]);

create or replace function public.salvar_evento(
  p_id bigint,
  p_nome text,
  p_descricao text,
  p_superior_id bigint,
  p_tempo_atendimento_minutos integer,
  p_bloqueio_repeticao_minutos integer,
  p_ativo boolean,
  p_sites bigint[] default '{}',
  p_emails text[] default '{}',
  p_extras jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_x jsonb := coalesce(p_extras, '{}'::jsonb);
begin
  if p_id is null then
    insert into public.eventos (nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo)
    values (p_nome, p_descricao, p_superior_id, p_tempo_atendimento_minutos, p_bloqueio_repeticao_minutos, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.eventos
       set nome = p_nome,
           descricao = p_descricao,
           superior_id = p_superior_id,
           tempo_atendimento_minutos = p_tempo_atendimento_minutos,
           bloqueio_repeticao_minutos = p_bloqueio_repeticao_minutos,
           ativo = coalesce(p_ativo, true)
     where id = p_id
    returning id into v_id;
    -- UPDATE barrado pelo RLS volta zero linhas, nao erro.
    if v_id is null then
      raise exception 'Evento inexistente ou sem permissão.' using errcode = '42501';
    end if;
  end if;

  -- Os campos da 0083, so quando vieram: um chamador antigo (sem `p_extras`)
  -- nao apaga o que o formulario novo gravou.
  if v_x <> '{}'::jsonb then
    update public.eventos
       set tempo_finalizacao_minutos = (v_x ->> 'tempo_finalizacao_minutos')::integer,
           status_final = nullif(v_x ->> 'status_final', ''),
           usuario_final_id = nullif(v_x ->> 'usuario_final_id', '')::uuid,
           responsavel_atendimento_id = nullif(v_x ->> 'responsavel_atendimento_id', '')::uuid,
           enviar_superior_imediato = coalesce((v_x ->> 'enviar_superior_imediato')::boolean, false),
           emails_copia = coalesce(array(select jsonb_array_elements_text(v_x -> 'emails_copia')), '{}'),
           prorrogacao_minutos = (v_x ->> 'prorrogacao_minutos')::integer,
           alarme = coalesce((v_x ->> 'alarme')::boolean, false),
           finalizacao_automatica = coalesce((v_x ->> 'finalizacao_automatica')::boolean, false),
           finalizacao_pela_ocorrencia_inicio = coalesce((v_x ->> 'finalizacao_pela_ocorrencia_inicio')::boolean, false),
           nps = nullif(v_x ->> 'nps', ''),
           tipo_classificacao_id = (v_x ->> 'tipo_classificacao_id')::bigint,
           grupo_responsavel_id = (v_x ->> 'grupo_responsavel_id')::bigint
     where id = v_id;
  end if;

  delete from public.eventos_sites s
   where s.evento_id = v_id
     and not (s.site_id = any (coalesce(p_sites, '{}')));
  insert into public.eventos_sites (evento_id, site_id)
  select v_id, unnest(coalesce(p_sites, '{}'))
  on conflict do nothing;

  insert into public.eventos_notificacoes (evento_id, emails)
  values (v_id, coalesce(p_emails, '{}'))
  on conflict (evento_id) do update set emails = excluded.emails;

  return v_id;
end;
$$;

comment on function public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[], jsonb) is
  'Grava o evento, os sites e os e-mails numa transacao (0072) e os campos da 0083 em `p_extras`.
   security INVOKER: as policies da 0072 sao o portao.';

revoke all on function public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[], jsonb) from public, anon;
grant execute on function public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[], jsonb) to authenticated;

-- 3) Alterar Eventos em massa ---------------------------------------------------------

create or replace function public.alterar_eventos_em_massa(
  p_eventos bigint[],
  p_sites bigint[],
  p_grupo_responsavel_id bigint,
  p_substituir boolean
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_quantos integer;
begin
  if coalesce(cardinality(p_eventos), 0) = 0 then
    raise exception 'Escolha ao menos um evento.' using errcode = '22023';
  end if;

  -- O grupo responsavel so muda quando veio; as policies da 0072 decidem quem.
  update public.eventos
     set grupo_responsavel_id = case
           when p_grupo_responsavel_id is not null then p_grupo_responsavel_id
           when p_substituir then null
           else grupo_responsavel_id
         end
   where id = any (p_eventos);
  get diagnostics v_quantos = row_count;
  if v_quantos = 0 then
    raise exception 'Nenhum evento alterado: sem permissão ou eventos inexistentes.' using errcode = '42501';
  end if;

  -- "Remover antigas e atualizar": os sites ficam exatamente os escolhidos.
  if p_substituir then
    delete from public.eventos_sites s
     where s.evento_id = any (p_eventos)
       and not (s.site_id = any (coalesce(p_sites, '{}')));
  end if;

  insert into public.eventos_sites (evento_id, site_id)
  select e, s from unnest(p_eventos) as e cross join unnest(coalesce(p_sites, '{}')) as s
  on conflict do nothing;

  return v_quantos;
end;
$$;

comment on function public.alterar_eventos_em_massa(bigint[], bigint[], bigint, boolean) is
  '"Alterar Eventos" do sistema de referencia: Grupo Responsavel e Sites de varios eventos de uma vez,
   mantendo as permissoes atuais (p_substituir = false) ou trocando por estas. security INVOKER. Ver 0083.';

revoke all on function public.alterar_eventos_em_massa(bigint[], bigint[], bigint, boolean) from public, anon;
grant execute on function public.alterar_eventos_em_massa(bigint[], bigint[], bigint, boolean) to authenticated;

-- 4) Finalizacao automatica -------------------------------------------------------------

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
     where o.status in ('AGUARDANDO', 'EM_ANALISE', 'CRITICO')
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
      -- O trigger da 0064 encerra como ATENDIDO; Cancelado e o outro final.
      if v_oc.status_final = 'CANCELADO' then
        update public.ocorrencias set status = 'CANCELADO' where id = v_oc.id;
      end if;
      v_quantos := v_quantos + 1;
    exception when others then
      raise warning 'finalizar_ocorrencias_vencidas: ocorrencia % nao finalizada: %', v_oc.id, sqlerrm;
    end;
  end loop;

  return v_quantos;
end;
$$;

comment on function manutencao.finalizar_ocorrencias_vencidas() is
  'Finaliza as ocorrencias abertas cujo evento tem "Finalizacao automatica" e o Tempo para Finalizacao
   vencido. Chamada pelo pg_cron a cada 10 minutos. Ver 0083.';

revoke all on function manutencao.finalizar_ocorrencias_vencidas() from public, anon, authenticated;

-- O agendamento so existe onde ha pg_cron (o stack local da CI pode nao ter).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'finalizar-ocorrencias-vencidas';
    perform cron.schedule(
      'finalizar-ocorrencias-vencidas',
      '*/10 * * * *',
      'select manutencao.finalizar_ocorrencias_vencidas()'
    );
  end if;
end;
$$;
