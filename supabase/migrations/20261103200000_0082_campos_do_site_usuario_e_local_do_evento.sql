-- ============================================================================
-- 0082 -- Campos do sistema de referencia que faltavam (comparacao de 03/11)
--
-- Tudo aditivo: colunas novas com default, nada muda nas linhas que existem.
--
--   1) Site / Planta:
--      - `emails_checklist`: a lista "E-mails Checklist" do antigo. Recebe o
--        aviso de inspecao (0080) de todo checklist feito no site.
--      - `notificar_eventos`: "Notificacoes Eventos", pessoas do portal que
--        recebem o e-mail de abertura de toda ocorrencia do site.
--      - Perda e Prevencao (responsaveis), Tipo de Intervencao, datas de
--        instalacao/desinstalacao e dias de instalacao: gravados como no
--        antigo, para consulta.
--   2) Usuarios: `lingua` (Portugues ou Espanhol), como no antigo.
--   3) Ocorrencias: `local_descricao`, o "Local do evento" do Registrar
--      Evento; a funcao do registro manual ganha o parametro.
--
-- Os e-mails novos respeitam a trava do aviso de inspecao
-- (`manutencao.aviso_de_inspecao.somente_para`): enquanto ela restringe, os
-- contatos de checklist do site so recebem se estiverem na lista -- como os
-- gestores (0080).
-- ============================================================================

-- 1) Site / Planta ---------------------------------------------------------------

alter table public.sites
  add column if not exists emails_checklist text[] not null default '{}',
  add column if not exists notificar_eventos uuid[] not null default '{}',
  add column if not exists responsavel_perda_id uuid references public.profiles (id) on delete set null,
  add column if not exists responsavel_prevencao_id uuid references public.profiles (id) on delete set null,
  add column if not exists tipo_intervencao text,
  add column if not exists data_instalacao date,
  add column if not exists dias_instalacao integer,
  add column if not exists data_desinstalacao date;

alter table public.sites drop constraint if exists sites_emails_checklist_validos;
alter table public.sites
  add constraint sites_emails_checklist_validos
  check (cardinality(emails_checklist) <= 20 and public.lista_de_emails_valida(emails_checklist));

alter table public.sites drop constraint if exists sites_notificar_eventos_teto;
alter table public.sites
  add constraint sites_notificar_eventos_teto check (cardinality(notificar_eventos) <= 50);

alter table public.sites drop constraint if exists sites_tipo_intervencao_valido;
alter table public.sites
  add constraint sites_tipo_intervencao_valido
  check (tipo_intervencao is null or tipo_intervencao in ('BARREIRA_TECNOLOGICA', 'RASTREADORES', 'CADEADO_BLUETOOTH'));

alter table public.sites drop constraint if exists sites_dias_instalacao_validos;
alter table public.sites
  add constraint sites_dias_instalacao_validos check (dias_instalacao is null or dias_instalacao between 0 and 36500);

comment on column public.sites.emails_checklist is
  'E-mails que recebem o aviso de inspecao de todo checklist do site ("E-mails Checklist" do antigo). Ver 0082.';
comment on column public.sites.notificar_eventos is
  'Pessoas do portal avisadas por e-mail na abertura de toda ocorrencia do site ("Notificacoes Eventos" do antigo). Ver 0082.';

-- Os cadastros escrevem coluna a coluna (0038).
grant insert (emails_checklist, notificar_eventos, responsavel_perda_id, responsavel_prevencao_id,
              tipo_intervencao, data_instalacao, dias_instalacao, data_desinstalacao)
  on public.sites to authenticated;
grant update (emails_checklist, notificar_eventos, responsavel_perda_id, responsavel_prevencao_id,
              tipo_intervencao, data_instalacao, dias_instalacao, data_desinstalacao)
  on public.sites to authenticated;

-- 2) Usuarios ----------------------------------------------------------------------

alter table public.profiles
  add column if not exists lingua text not null default 'PT';

alter table public.profiles drop constraint if exists profiles_lingua_valida;
alter table public.profiles
  add constraint profiles_lingua_valida check (lingua in ('PT', 'ES'));

-- O cadastro de usuarios grava pelo service_role, coluna a coluna (0058).
grant insert (lingua), update (lingua) on public.profiles to service_role;

-- 3) Local do evento ------------------------------------------------------------------

alter table public.ocorrencias
  add column if not exists local_descricao text;

alter table public.ocorrencias drop constraint if exists ocorrencias_local_descricao_tamanho;
alter table public.ocorrencias
  add constraint ocorrencias_local_descricao_tamanho
  check (local_descricao is null or length(local_descricao) <= 200);

-- A assinatura muda (parametro novo): a antiga sai, para o envelope nao
-- chamar uma sobrecarga que ninguem mais usa.
drop function if exists public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text);
drop function if exists escrita.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text);

create or replace function escrita.registrar_ocorrencia_manual(
  p_site_id bigint,
  p_evento_id bigint,
  p_subevento_id bigint,
  p_classificacao_id bigint,
  p_observacao text,
  p_local text
)
returns bigint
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
declare
  v_evento record;
  v_ano smallint;
  v_numero integer;
  v_id bigint;
begin
  if not autorizacao.pode_administrar_usuarios() then
    raise exception 'Sem permissão para registrar evento.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.sites s where s.id = p_site_id and s.ativo) then
    raise exception 'Site inválido ou inativo.' using errcode = '23514';
  end if;

  select e.id, e.bloqueio_repeticao_minutos
    into v_evento
    from public.eventos e
   where e.id = p_evento_id and e.ativo;
  if v_evento.id is null then
    raise exception 'Evento inválido ou inativo.' using errcode = '23514';
  end if;

  if exists (select 1 from public.eventos_sites es where es.evento_id = p_evento_id)
     and not exists (
       select 1 from public.eventos_sites es where es.evento_id = p_evento_id and es.site_id = p_site_id
     ) then
    raise exception 'Este evento não está disponível para o site escolhido.' using errcode = '23514';
  end if;

  if p_subevento_id is not null and not exists (
    select 1 from public.eventos e where e.id = p_subevento_id and e.superior_id = p_evento_id and e.ativo
  ) then
    raise exception 'Subtipo inválido para este evento.' using errcode = '23514';
  end if;

  if p_classificacao_id is not null and not exists (
    select 1 from public.tipos_de_classificacao t where t.id = p_classificacao_id and t.ativo
  ) then
    raise exception 'Classificação inválida ou inativa.' using errcode = '23514';
  end if;

  v_ano := extract(year from now() at time zone 'America/Sao_Paulo')::smallint;
  -- O mesmo lock da 0063: checklist e registro manual dividem a sequencia.
  perform pg_advisory_xact_lock(hashtext('ocorrencias'), v_ano);

  -- Dentro do lock: duas aberturas no mesmo instante nao passam as duas.
  if v_evento.bloqueio_repeticao_minutos is not null and exists (
    select 1 from public.ocorrencias o
     where o.site_id = p_site_id
       and o.evento_id = p_evento_id
       and o.criado_em > now() - make_interval(mins => v_evento.bloqueio_repeticao_minutos)
  ) then
    raise exception 'Já existe uma ocorrência deste evento neste site dentro do bloqueio de repetição.'
      using errcode = 'P0001', hint = 'bloqueio_de_repeticao';
  end if;

  select coalesce(max(o.numero), 0) + 1 into v_numero
    from public.ocorrencias o
   where o.ano = v_ano;

  insert into public.ocorrencias (
    numero, ano, origem, site_id, evento_id, subevento_id, classificacao_id, observacao, aberta_por, local_descricao
  ) values (
    v_numero, v_ano, 'MANUAL', p_site_id, p_evento_id, p_subevento_id, p_classificacao_id,
    nullif(btrim(p_observacao), ''), auth.uid(), left(nullif(btrim(p_local), ''), 200)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function escrita.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text, text) from public, anon;
grant execute on function escrita.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text, text) to authenticated;

create or replace function public.registrar_ocorrencia_manual(
  p_site_id bigint,
  p_evento_id bigint,
  p_subevento_id bigint default null,
  p_classificacao_id bigint default null,
  p_observacao text default null,
  p_local text default null
)
returns bigint
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.registrar_ocorrencia_manual(
    p_site_id, p_evento_id, p_subevento_id, p_classificacao_id, p_observacao, p_local
  );
$$;

comment on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text, text) is
  'Registrar Evento: abre uma ocorrencia sem checklist, com o "Local do evento" (0082). So o GESTOR.
   Envelope de escrita.registrar_ocorrencia_manual.';

revoke all on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text, text) from public, anon;
grant execute on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text, text) to authenticated;

-- 4) Os e-mails novos -------------------------------------------------------------------

-- Aviso de inspecao (0080) + os "E-mails Checklist" do site, pela mesma trava.
create or replace function manutencao.email_do_checklist_ao_superior()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.checklist_emails (checklist_id, destinatario)
    select distinct new.id, d.email
      from (
        -- O superior de quem enviou, com a caixa marcada (0068).
        select lower(btrim(superior.email)) as email
          from public.visitas v
          join public.profiles autor on autor.id = v.funcionario_id
          join public.profiles superior on superior.id = autor.superior_id
         where v.id = new.visita_id
           and autor.email_superior_checklist
           and superior.ativo
           and superior.id <> autor.id
        union
        -- Todos os gestores ativos (0080), pela trava.
        select lower(btrim(g.email))
          from public.profiles g
         cross join manutencao.aviso_de_inspecao c
         where g.ativo
           and g.cargo = 'GESTOR'
           and (c.somente_para is null or lower(btrim(g.email)) = any (c.somente_para))
        union
        -- Os "E-mails Checklist" do site da visita (0082), pela mesma trava.
        select lower(btrim(e))
          from public.visitas v
          join public.sites s on s.id = v.site_id
         cross join unnest(s.emails_checklist) as e
         cross join manutencao.aviso_de_inspecao c
         where v.id = new.visita_id
           and (c.somente_para is null or lower(btrim(e)) = any (c.somente_para))
      ) as d
     where coalesce(d.email, '') <> '';
  exception when others then
    -- Como na 0065: um problema aqui nunca recusa o envio do checklist.
    raise warning 'email_do_checklist_ao_superior: e-mails nao enfileirados (checklist %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

-- Abertura da ocorrencia (0065/0068/0072) + as pessoas de "Notificacoes
-- Eventos" do site (0082), ativas e com e-mail.
create or replace function manutencao.emails_da_abertura_da_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario)
    select distinct new.id, 'ABERTURA', d.email
      from (
        select lower(btrim(e)) as email
          from public.sites s
         cross join unnest(s.emails_eventos) as e
         where s.id = new.site_id
        union
        select lower(btrim(e))
          from public.eventos_notificacoes n
         cross join unnest(n.emails) as e
         where n.evento_id = new.evento_id
        union
        select lower(btrim(superior.email))
          from public.profiles autor
          join public.profiles superior on superior.id = autor.superior_id
         where autor.id = new.aberta_por
           and autor.email_superior_evento
           and superior.ativo
           and superior.id <> autor.id
           and superior.email is not null
        union
        select lower(btrim(p.email))
          from public.sites s
          join public.profiles p on p.id = any (s.notificar_eventos)
         where s.id = new.site_id
           and p.ativo
           and p.email is not null
      ) as d
     where d.email <> '';
  exception when others then
    raise warning 'emails_da_abertura_da_ocorrencia: e-mails nao enfileirados (ocorrencia %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
