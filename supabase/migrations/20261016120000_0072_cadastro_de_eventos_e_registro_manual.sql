-- ============================================================================
-- 0072 — Cadastro de Eventos e Registrar Evento (ocorrencia sem checklist)
--
-- Issue #209, itens 6 e 7 (menu Eventos do GESTOR no sistema de referencia,
-- lido em 15 e 16/10/2026).
--
-- CADASTRO DE EVENTOS. La a lista tem ID, Nome, Descricao, Superior, Sites,
-- E-mails, Tempo para Atendimento, Bloqueio de Repeticao e Status. Nos 29
-- eventos de la, so Nome, E-mails e Status estao preenchidos; o formulario tem
-- muito mais (NPS, alarme, finalizacao automatica, "Solicita Facil",
-- permissoes por grupo), tudo no padrao em todos. Entra o que a lista mostra:
--   - `descricao`;
--   - `superior_id`: o evento "pai". Na referencia e isso que vira o "SubTipo
--     de Evento" do Registrar Evento -- os filhos do evento escolhido;
--   - `eventos_sites`: os sites onde o evento vale. Vazio = todos;
--   - `eventos_notificacoes.emails`: quem recebe a abertura da ocorrencia
--     daquele evento, alem dos contatos do site e do superior (0065/0068).
--     Em TABELA PROPRIA: `eventos` e lida por todo usuario ativo (o app de
--     campo lista os eventos), e endereco de e-mail interno nao precisa
--     chegar a inspetor nem a cliente. So o GESTOR le e escreve;
--   - `tempo_atendimento_minutos`: o prazo, so registrado e exibido. Na
--     referencia ele liga o status "Critico" sozinho; nenhum evento de la usa,
--     e automatizar status por relogio fica para quando alguem usar;
--   - `bloqueio_repeticao_minutos`: recusa uma ocorrencia MANUAL do mesmo
--     evento no mesmo site dentro do intervalo. Nao vale para a que nasce do
--     checklist (0063): recusar ali derrubaria a sincronizacao do inspetor.
--   - Status: o `ativo` que ja existe.
-- Escrita so do GESTOR (`pode_administrar_usuarios()`), a mesma regua da 0071:
-- na referencia, o SUPERVISOR nao ve estes menus. Sem DELETE: um evento usado
-- em ocorrencia nao pode sumir do historico -- desativa.
--
-- REGISTRAR EVENTO. Ocorrencia aberta a mao, sem checklist: Site, Evento,
-- SubTipo, Classificacao, arquivos e observacao, como na referencia.
--   - `ocorrencias.origem` ('CHECKLIST' | 'MANUAL'); visita, checklist,
--     pergunta e resposta passam a ser opcionais, com um CHECK amarrando cada
--     origem ao que ela exige;
--   - numero/ano na mesma sequencia e no mesmo lock da 0063;
--   - quem le: a mesma regra da visita (`pode_ver_visita`, 0042) -- a gestao
--     inteira, o autor, e o cliente no escopo do site;
--   - quem abre: `registrar_ocorrencia_manual`. O corpo e `security definer`
--     em `escrita` (envelope em `public`, regra da 0050), porque
--     `authenticated` continua sem INSERT em `ocorrencias` (a 0063 so deixa o
--     trigger escrever). A funcao confere o GESTOR primeiro;
--   - arquivos: o navegador envia ao bucket `ocorrencias` (0064) DEPOIS que a
--     ocorrencia existe, na pasta dela, e grava em `ocorrencia_arquivos` sem
--     andamento. A policy so aceita isso do autor da ocorrencia manual, na
--     primeira hora;
--   - a abertura dispara os mesmos e-mails da 0065/0068, agora com os do
--     evento;
--   - `ocorrencias_de_evento` (base dos relatorios de Eventos) passa a contar
--     as manuais: `left join` na visita, e o "usuario" e quem abriu.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Eventos: campos do cadastro --------------------------------------------------

alter table public.eventos add column if not exists descricao text;
alter table public.eventos add column if not exists superior_id bigint references public.eventos (id) on delete restrict;
alter table public.eventos add column if not exists tempo_atendimento_minutos integer;
alter table public.eventos add column if not exists bloqueio_repeticao_minutos integer;

alter table public.eventos drop constraint if exists eventos_descricao_check;
alter table public.eventos
  add constraint eventos_descricao_check check (descricao is null or length(descricao) <= 1000);
alter table public.eventos drop constraint if exists eventos_superior_check;
alter table public.eventos
  add constraint eventos_superior_check check (superior_id is null or superior_id <> id);
alter table public.eventos drop constraint if exists eventos_tempo_atendimento_check;
alter table public.eventos
  add constraint eventos_tempo_atendimento_check
  check (tempo_atendimento_minutos is null or tempo_atendimento_minutos between 1 and 525600);
alter table public.eventos drop constraint if exists eventos_bloqueio_repeticao_check;
alter table public.eventos
  add constraint eventos_bloqueio_repeticao_check
  check (bloqueio_repeticao_minutos is null or bloqueio_repeticao_minutos between 1 and 525600);
alter table public.eventos drop constraint if exists eventos_nome_nao_vazio;
alter table public.eventos
  add constraint eventos_nome_nao_vazio check (length(btrim(nome)) between 1 and 100);

create index if not exists eventos_superior_idx on public.eventos (superior_id);

-- Nome repetido confunde o select do app e do Registrar Evento. Os 30 de hoje
-- sao distintos sem diferenciar maiusculas (conferido em 16/10).
create unique index if not exists eventos_nome_unico on public.eventos (lower(btrim(nome)));

grant insert (nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo),
      update (nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo)
   on public.eventos to authenticated;

drop policy if exists "Gestor cadastra evento" on public.eventos;
create policy "Gestor cadastra evento" on public.eventos
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita evento" on public.eventos;
create policy "Gestor edita evento" on public.eventos
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

-- Ciclo de superior: A -> B -> A faria o SubTipo apontar para si mesmo pela
-- volta. A tela so oferece eventos sem superior como pai (um nivel, como na
-- referencia, onde o select so mostra a "Raiz" e os de primeiro nivel), e o
-- banco garante o mesmo.
create or replace function manutencao.evento_superior_um_nivel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.superior_id is not null then
    if exists (select 1 from public.eventos p where p.id = new.superior_id and p.superior_id is not null) then
      raise exception 'O evento superior não pode ser um subtipo.' using errcode = '23514';
    end if;
    if exists (select 1 from public.eventos f where f.superior_id = new.id) then
      raise exception 'Um evento com subtipos não pode ter superior.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function manutencao.evento_superior_um_nivel() from public, anon, authenticated;

drop trigger if exists evento_superior_um_nivel on public.eventos;
create trigger evento_superior_um_nivel
  before insert or update of superior_id on public.eventos
  for each row execute function manutencao.evento_superior_um_nivel();

-- 2) Sites do evento ---------------------------------------------------------------

create table if not exists public.eventos_sites (
  evento_id bigint not null references public.eventos (id) on delete cascade,
  site_id bigint not null references public.sites (id) on delete cascade,
  primary key (evento_id, site_id)
);

create index if not exists eventos_sites_site_idx on public.eventos_sites (site_id);

alter table public.eventos_sites enable row level security;

revoke all on public.eventos_sites from anon, authenticated;
grant select, insert, delete on public.eventos_sites to authenticated;
grant all on public.eventos_sites to service_role;

-- Leitura como a de `eventos` (todo usuario ativo): a restricao por site e o
-- que o select de evento precisa saber, e nao diz nada alem do que a lista de
-- sites de cada um ja diz.
drop policy if exists "Leitura para usuarios ativos" on public.eventos_sites;
create policy "Leitura para usuarios ativos" on public.eventos_sites
  for select to authenticated
  using ((select autorizacao.usuario_ativo()));

drop policy if exists "Gestor liga evento a site" on public.eventos_sites;
create policy "Gestor liga evento a site" on public.eventos_sites
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor desliga evento de site" on public.eventos_sites;
create policy "Gestor desliga evento de site" on public.eventos_sites
  for delete to authenticated
  using ((select autorizacao.pode_administrar_usuarios()));

-- 3) E-mails do evento --------------------------------------------------------------

create table if not exists public.eventos_notificacoes (
  evento_id bigint primary key references public.eventos (id) on delete cascade,
  emails text[] not null default '{}',
  constraint eventos_notificacoes_emails_check
    check (cardinality(emails) <= 20 and public.lista_de_emails_valida(emails))
);

alter table public.eventos_notificacoes enable row level security;

revoke all on public.eventos_notificacoes from anon, authenticated;
grant select, insert, update on public.eventos_notificacoes to authenticated;
grant all on public.eventos_notificacoes to service_role;

drop policy if exists "Gestor le os e-mails do evento" on public.eventos_notificacoes;
create policy "Gestor le os e-mails do evento" on public.eventos_notificacoes
  for select to authenticated
  using ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor grava os e-mails do evento" on public.eventos_notificacoes;
create policy "Gestor grava os e-mails do evento" on public.eventos_notificacoes
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita os e-mails do evento" on public.eventos_notificacoes;
create policy "Gestor edita os e-mails do evento" on public.eventos_notificacoes
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

-- 4) Salvar o evento numa transacao -------------------------------------------------
-- Evento, sites e e-mails sao tres tabelas; pela API, uma falha no meio deixaria
-- o evento sem os sites. `security invoker`: atomicidade, nao privilegio -- as
-- policies acima continuam sendo o portao.

create or replace function public.salvar_evento(
  p_id bigint,
  p_nome text,
  p_descricao text,
  p_superior_id bigint,
  p_tempo_atendimento_minutos integer,
  p_bloqueio_repeticao_minutos integer,
  p_ativo boolean,
  p_sites bigint[] default '{}',
  p_emails text[] default '{}'
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
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

revoke all on function public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[]) from public, anon;
grant execute on function public.salvar_evento(bigint, text, text, bigint, integer, integer, boolean, bigint[], text[]) to authenticated;

-- 5) Ocorrencia manual ----------------------------------------------------------------

alter table public.ocorrencias add column if not exists origem text not null default 'CHECKLIST';
alter table public.ocorrencias add column if not exists subevento_id bigint references public.eventos (id);
alter table public.ocorrencias add column if not exists classificacao_id bigint references public.tipos_de_classificacao (id);

alter table public.ocorrencias alter column visita_id drop not null;
alter table public.ocorrencias alter column checklist_id drop not null;
alter table public.ocorrencias alter column pergunta_id drop not null;
alter table public.ocorrencias alter column pergunta_texto drop not null;
alter table public.ocorrencias alter column resposta drop not null;

alter table public.ocorrencias drop constraint if exists ocorrencias_origem_check;
alter table public.ocorrencias
  add constraint ocorrencias_origem_check check (
    (origem = 'CHECKLIST'
       and visita_id is not null and checklist_id is not null and pergunta_id is not null
       and pergunta_texto is not null and resposta is not null)
    or (origem = 'MANUAL'
       and visita_id is null and checklist_id is null and pergunta_id is null
       and pergunta_texto is null and resposta is null and aberta_por is not null)
  );

alter table public.ocorrencias drop constraint if exists ocorrencias_observacao_tamanho;
alter table public.ocorrencias
  add constraint ocorrencias_observacao_tamanho check (observacao is null or length(observacao) <= 2000);

drop policy if exists "Leitura da ocorrencia no escopo da visita" on public.ocorrencias;
create policy "Leitura da ocorrencia no escopo da visita"
  on public.ocorrencias
  for select
  to authenticated
  using (
    case
      when visita_id is not null then autorizacao.pode_ver_visita(visita_id)
      -- A mesma regra de `pode_ver_visita` (0042), com o autor no lugar do
      -- inspetor da visita.
      else autorizacao.pode_ver_toda_operacao()
        or (autorizacao.usuario_ativo() and aberta_por = (select auth.uid()))
        or (autorizacao.e_cliente() and exists (
          select 1 from public.sites s
           where s.id = ocorrencias.site_id and autorizacao.pode_ver_grupo_site(s.grupo_site_id)
        ))
    end
  );

-- O trabalho e `security definer` em `escrita` (fora do PostgREST), e `public`
-- so tem o envelope `security invoker` -- a regra da 0050, no molde da 0067.
create or replace function escrita.registrar_ocorrencia_manual(
  p_site_id bigint,
  p_evento_id bigint,
  p_subevento_id bigint,
  p_classificacao_id bigint,
  p_observacao text
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
    numero, ano, origem, site_id, evento_id, subevento_id, classificacao_id, observacao, aberta_por
  ) values (
    v_numero, v_ano, 'MANUAL', p_site_id, p_evento_id, p_subevento_id, p_classificacao_id,
    nullif(btrim(p_observacao), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function escrita.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text) from public, anon;
grant execute on function escrita.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text) to authenticated;

-- O envelope que o painel chama por RPC: mesmo nome, roda como quem chama.
create or replace function public.registrar_ocorrencia_manual(
  p_site_id bigint,
  p_evento_id bigint,
  p_subevento_id bigint default null,
  p_classificacao_id bigint default null,
  p_observacao text default null
)
returns bigint
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.registrar_ocorrencia_manual(p_site_id, p_evento_id, p_subevento_id, p_classificacao_id, p_observacao);
$$;

comment on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text) is
  'Registrar Evento: abre uma ocorrencia sem checklist. So o GESTOR. Envelope
   de escrita.registrar_ocorrencia_manual (security definer, porque
   authenticated nao tem INSERT em ocorrencias) -- migration 0072.';

revoke all on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text) from public, anon;
grant execute on function public.registrar_ocorrencia_manual(bigint, bigint, bigint, bigint, text) to authenticated;

-- 6) Arquivos da abertura ------------------------------------------------------------

alter table public.ocorrencia_arquivos alter column andamento_id drop not null;

drop policy if exists "Autor anexa arquivo ao registro manual" on public.ocorrencia_arquivos;
create policy "Autor anexa arquivo ao registro manual" on public.ocorrencia_arquivos
  for insert to authenticated
  with check (
    andamento_id is null
    and (select autorizacao.pode_administrar_usuarios())
    and exists (
      select 1 from public.ocorrencias o
       where o.id = ocorrencia_arquivos.ocorrencia_id
         and o.origem = 'MANUAL'
         and o.aberta_por = (select auth.uid())
         and o.criado_em > now() - interval '1 hour'
    )
  );

-- 7) E-mails da abertura, agora com os do evento -----------------------------------

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
      ) as d
     where d.email <> '';
  exception when others then
    raise warning 'emails_da_abertura_da_ocorrencia: e-mails nao enfileirados (ocorrencia %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

-- 8) Relatorios de Eventos contam as manuais ------------------------------------------

create or replace function public.ocorrencias_de_evento(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_por_data_insercao boolean default false,
  p_filtros jsonb default '{}'::jsonb
)
returns table (
  site_id bigint,
  site_nome text,
  grupo_site_nome text,
  evento_id bigint,
  evento_nome text,
  quando timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  with f as (
    select
      nullif(p_filtros ->> 'site', '')::bigint          as site,
      nullif(p_filtros ->> 'grupo_site', '')::bigint    as grupo_site,
      nullif(p_filtros ->> 'funcionario', '')::uuid     as funcionario,
      nullif(p_filtros ->> 'evento', '')::bigint        as evento,
      nullif(p_filtros ->> 'grupo_usuario', '')::bigint as grupo_usuario,
      nullif(p_filtros ->> 'coletor_dados', '')::bigint as coletor_dados,
      nullif(p_filtros ->> 'atividade', '')::bigint     as atividade
  ),
  lidas as (
    select
      v.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      l.evento_id as eid,
      e.nome    as enome,
      case when p_por_data_insercao then l.data_integracao else l.data_hora end as q
    from public.leituras l
    join public.visitas v on v.id = l.visita_id
    join public.sites s on s.id = v.site_id
    join public.eventos e on e.id = l.evento_id
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where l.evento_id is not null
      and (f.site is null or v.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or v.funcionario_id = f.funcionario)
      and (f.evento is null or l.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.atividade is null or l.acao_id = f.atividade)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = v.funcionario_id and m.grupo_id = f.grupo_usuario
      ))
  ),
  -- Do checklist e manuais. `left join` na visita: a manual nao tem; o
  -- "usuario" dela e quem abriu.
  abertas as (
    select
      o.site_id as sid,
      s.nome    as snome,
      g.nome    as gnome,
      o.evento_id as eid,
      e.nome    as enome,
      o.criado_em as q
    from public.ocorrencias o
    left join public.visitas v on v.id = o.visita_id
    join public.sites s on s.id = o.site_id
    join public.eventos e on e.id = o.evento_id
    left join public.grupos_sites g on g.id = s.grupo_site_id
    cross join f
    where f.atividade is null
      and (f.site is null or o.site_id = f.site)
      and (f.grupo_site is null or s.grupo_site_id = f.grupo_site)
      and (f.funcionario is null or coalesce(v.funcionario_id, o.aberta_por) = f.funcionario)
      and (f.evento is null or o.evento_id = f.evento)
      and (f.coletor_dados is null or v.coletor_dados_id = f.coletor_dados)
      and (f.grupo_usuario is null or exists (
        select 1 from public.grupos_usuarios_membros m
         where m.profile_id = coalesce(v.funcionario_id, o.aberta_por) and m.grupo_id = f.grupo_usuario
      ))
  )
  select sid, snome, gnome, eid, enome, q
  from (select * from lidas union all select * from abertas) t
  where q >= p_inicio
    and q < p_fim
$$;

-- 9) Auditoria ---------------------------------------------------------------------------

drop trigger if exists auditoria_trigger on public.eventos;
create trigger auditoria_trigger
  after insert or update or delete on public.eventos
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.eventos_sites;
create trigger auditoria_trigger
  after insert or update or delete on public.eventos_sites
  for each row execute function public.registrar_auditoria('evento_id', 'site_id');

drop trigger if exists auditoria_trigger on public.eventos_notificacoes;
create trigger auditoria_trigger
  after insert or update or delete on public.eventos_notificacoes
  for each row execute function public.registrar_auditoria('evento_id');
