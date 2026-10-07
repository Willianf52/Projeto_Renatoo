-- ============================================================================
-- 0065 — e-mails das ocorrencias (item 4 da #164)
--
-- No sistema de referencia, o cadastro do site tem "E-mails Eventos" e o
-- detalhe da ocorrencia lista os "E-mails Enviados" (destinatario, data/hora).
-- Aqui:
--
--   - `sites.emails_eventos`: os contatos do site que recebem o aviso.
--   - `ocorrencia_emails`: uma linha por destinatario e por momento -- e a fila
--     de envio E o historico que o detalhe mostra. Quem envia e a aplicacao
--     (`/api/webhooks/ocorrencia-emails`, pela Resend); o banco so decide QUEM
--     recebe e QUANDO, nos mesmos triggers que ja mudam o estado da ocorrencia.
--
-- QUEM RECEBE (regra desta migration, a confirmar com o dono):
--   - ABERTURA:    os e-mails do site.
--   - ANALISE:     o responsavel e os usuarios de apoio escolhidos na analise,
--                  e os e-mails externos digitados nela.
--   - FINALIZACAO: os usuarios de "Avisar sobre a Finalizacao", os e-mails
--                  externos e, de novo, os e-mails do site -- quem soube que
--                  abriu fica sabendo que fechou.
--   Repetidos no mesmo momento saem uma vez so (comparacao sem maiusculas).
--
-- COMO O PORTAL FICA SABENDO: um trigger por comando em `ocorrencia_emails`
-- chama a rota pelo pg_net, no molde da 0053: URL e segredo vem do Vault, e
-- NUNCA derrubam quem gravou. A ocorrencia nasce dentro da sincronizacao do
-- app de campo (0063); um problema de e-mail nao pode recusar as respostas
-- do inspetor. Falha vira `warning` e a linha fica PENDENTE -- a rota de cron
-- diaria e o proximo aviso recolhem o que sobrou.
--
-- SEM SEGREDO NOVO: o aviso reusa o segredo do aviso de troca de senha
-- (`webhook_user_updated_secret`, mesmo remetente e mesma aplicacao) e a URL e
-- derivada da dele, trocando o caminho. `webhook_ocorrencia_emails_url` no
-- Vault, se existir, tem precedencia -- e a saida para apontar outro lugar.
--
-- O ENVIO EM SI: `reservar_emails_de_ocorrencia` entrega um lote a quem envia
-- (`for update skip locked`: duas chamadas ao mesmo tempo nao mandam o mesmo
-- e-mail duas vezes), devolve a fila o que travou no meio e descarta o que
-- esperou demais -- um aviso de abertura que chega dias depois so confunde.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Lista de e-mails valida --------------------------------------------------
-- Funcao, e nao subconsulta no CHECK (que o Postgres nao aceita). Mesmo
-- criterio de `lerEmails` em painel-de-eventos/andamentos.ts.

create or replace function public.lista_de_emails_valida(p_emails text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(bool_and(e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(e) <= 254), true)
    from unnest(p_emails) as e
$$;

comment on function public.lista_de_emails_valida(text[]) is
  'Todo item e um e-mail plausivel (algo@algo.algo, ate 254 caracteres). Usada nos CHECK de listas de e-mail. Ver migration 0065.';

-- 2) Contatos do site ----------------------------------------------------------

alter table public.sites
  add column if not exists emails_eventos text[] not null default '{}';

alter table public.sites drop constraint if exists sites_emails_eventos_validos;
alter table public.sites
  add constraint sites_emails_eventos_validos
  check (cardinality(emails_eventos) <= 20 and public.lista_de_emails_valida(emails_eventos));

comment on column public.sites.emails_eventos is
  'Contatos do site avisados por e-mail quando uma ocorrencia abre e quando e finalizada ("E-mails Eventos" no sistema de referencia). Ver migration 0065.';

-- Os cadastros escrevem coluna a coluna (0038): sem estes grants, salvar o site
-- com o campo novo falharia com "permission denied".
grant insert (emails_eventos) on public.sites to authenticated;
grant update (emails_eventos) on public.sites to authenticated;

-- 3) Fila e historico ------------------------------------------------------------

create table if not exists public.ocorrencia_emails (
  id bigint generated always as identity primary key,
  ocorrencia_id bigint not null references public.ocorrencias (id) on delete cascade,
  andamento_id bigint references public.ocorrencia_andamentos (id) on delete cascade,
  motivo text not null check (motivo in ('ABERTURA', 'ANALISE', 'FINALIZACAO')),
  destinatario text not null check (length(destinatario) <= 254),
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHOU', 'DESCARTADO')),
  tentativas smallint not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  -- Id da mensagem na Resend, para rastrear uma entrega reclamada.
  id_externo text
);

comment on table public.ocorrencia_emails is
  'Um e-mail por destinatario e por momento (abertura, analise, finalizacao) de uma ocorrencia: fila de envio e "E-mails Enviados" do detalhe. So o service_role escreve. Ver migration 0065.';

create index if not exists ocorrencia_emails_ocorrencia_idx on public.ocorrencia_emails (ocorrencia_id);
create index if not exists ocorrencia_emails_fila_idx on public.ocorrencia_emails (id) where status in ('PENDENTE', 'ENVIANDO');

alter table public.ocorrencia_emails enable row level security;

revoke all on public.ocorrencia_emails from anon, authenticated;
grant select on public.ocorrencia_emails to authenticated;
grant all on public.ocorrencia_emails to service_role;

-- Ve os e-mails quem ve a ocorrencia: o `exists` passa pelo RLS de
-- `ocorrencias` (0063), que e o portao de verdade.
drop policy if exists "Leitura dos e-mails de quem ve a ocorrencia" on public.ocorrencia_emails;
create policy "Leitura dos e-mails de quem ve a ocorrencia"
  on public.ocorrencia_emails
  for select
  to authenticated
  using (exists (select 1 from public.ocorrencias o where o.id = ocorrencia_id));

-- 4) Quem recebe --------------------------------------------------------------------

create schema if not exists manutencao;

create or replace function manutencao.emails_da_abertura_da_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.ocorrencia_emails (ocorrencia_id, motivo, destinatario)
    select distinct new.id, 'ABERTURA', lower(btrim(e))
      from public.sites s
     cross join unnest(s.emails_eventos) as e
     where s.id = new.site_id
       and btrim(e) <> '';
  exception when others then
    raise warning 'emails_da_abertura_da_ocorrencia: e-mails nao enfileirados (ocorrencia %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function manutencao.emails_da_abertura_da_ocorrencia() from public, anon, authenticated;

drop trigger if exists emails_da_abertura_da_ocorrencia on public.ocorrencias;
create trigger emails_da_abertura_da_ocorrencia
  after insert on public.ocorrencias
  for each row execute function manutencao.emails_da_abertura_da_ocorrencia();

create or replace function manutencao.emails_do_andamento_da_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.ocorrencia_emails (ocorrencia_id, andamento_id, motivo, destinatario)
    select distinct new.ocorrencia_id, new.id, new.tipo, d.email
      from (
        select lower(btrim(e)) as email from unnest(new.emails_externos) as e
        union
        select lower(btrim(p.email))
          from public.profiles p
         where p.email is not null
           and (
             (new.tipo = 'ANALISE' and (p.id = new.responsavel_id or p.id = any (new.apoio)))
             or (new.tipo = 'FINALIZACAO' and p.id = any (new.avisar))
           )
        union
        select lower(btrim(e))
          from public.ocorrencias o
          join public.sites s on s.id = o.site_id
         cross join unnest(s.emails_eventos) as e
         where new.tipo = 'FINALIZACAO'
           and o.id = new.ocorrencia_id
      ) as d
     where d.email <> '';
  exception when others then
    raise warning 'emails_do_andamento_da_ocorrencia: e-mails nao enfileirados (andamento %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function manutencao.emails_do_andamento_da_ocorrencia() from public, anon, authenticated;

drop trigger if exists emails_do_andamento_da_ocorrencia on public.ocorrencia_andamentos;
create trigger emails_do_andamento_da_ocorrencia
  after insert on public.ocorrencia_andamentos
  for each row execute function manutencao.emails_do_andamento_da_ocorrencia();

-- 5) Avisar o portal ------------------------------------------------------------------
-- Por comando, com tabela de transicao: uma resposta com cinco "Nao conforme"
-- gera cinco comandos (um por ocorrencia), e um comando que nao enfileirou
-- nada (site sem contato) nao chama ninguem.

create or replace function manutencao.avisar_portal_dos_emails_de_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_url     text;
  v_segredo text;
begin
  if not exists (select 1 from novos_emails) then
    return null;
  end if;

  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise warning 'avisar_portal_dos_emails_de_ocorrencia: Vault ou pg_net indisponivel; e-mails ficam na fila';
    return null;
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'webhook_ocorrencia_emails_url'$q$
    into v_url;
  if v_url is null then
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'webhook_user_updated_url'$q$
      into v_url;
    v_url := regexp_replace(v_url, '/api/webhooks/user-updated/?$', '/api/webhooks/ocorrencia-emails');
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'webhook_user_updated_secret'$q$
    into v_segredo;

  if v_url is null or v_segredo is null or v_url !~ '/api/webhooks/ocorrencia-emails/?$' then
    raise warning 'avisar_portal_dos_emails_de_ocorrencia: URL ou segredo do Vault ausentes; e-mails ficam na fila';
    return null;
  end if;

  execute $q$
    select net.http_post(
      url                  := $1,
      body                 := $2,
      params               := '{}'::jsonb,
      headers              := $3,
      timeout_milliseconds := 5000
    )
  $q$
  using
    v_url,
    jsonb_build_object('type', 'OCORRENCIA_EMAILS'),
    jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_segredo);

  return null;
exception when others then
  -- Nunca o segredo nem a URL na mensagem: warning vai para o log do Postgres.
  raise warning 'avisar_portal_dos_emails_de_ocorrencia: falha ao avisar o portal: %', sqlerrm;
  return null;
end;
$$;

revoke all on function manutencao.avisar_portal_dos_emails_de_ocorrencia() from public, anon, authenticated;

drop trigger if exists avisar_portal_dos_emails_de_ocorrencia on public.ocorrencia_emails;
create trigger avisar_portal_dos_emails_de_ocorrencia
  after insert on public.ocorrencia_emails
  referencing new table as novos_emails
  for each statement execute function manutencao.avisar_portal_dos_emails_de_ocorrencia();

-- 6) Lote para quem envia ---------------------------------------------------------------
-- `p_somente`: so estes destinatarios (minusculos) -- enquanto o dominio
-- proprio nao esta verificado, a Resend so entrega para o dono da conta, e o
-- resto espera na fila ate ser descartado. `null` = todos.

create or replace function public.reservar_emails_de_ocorrencia(
  p_limite integer default 50,
  p_somente text[] default null
)
returns table (id bigint, ocorrencia_id bigint, andamento_id bigint, motivo text, destinatario text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  -- Travou no meio (a funcao caiu entre reservar e marcar): volta para a fila,
  -- ou desiste depois de tres tentativas.
  update public.ocorrencia_emails
     set status = case when tentativas >= 3 then 'FALHOU' else 'PENDENTE' end,
         erro = coalesce(erro, 'envio interrompido')
   where status = 'ENVIANDO'
     and reservado_em < now() - interval '10 minutes';

  update public.ocorrencia_emails
     set status = 'DESCARTADO',
         erro = 'Não enviado em 3 dias: o domínio de e-mail ainda não estava configurado.'
   where status = 'PENDENTE'
     and criado_em < now() - interval '3 days';

  return query
  update public.ocorrencia_emails e
     set status = 'ENVIANDO',
         tentativas = e.tentativas + 1,
         reservado_em = now()
   where e.id in (
     select x.id
       from public.ocorrencia_emails x
      where x.status = 'PENDENTE'
        and (p_somente is null or x.destinatario = any (p_somente))
      order by x.id
      limit greatest(1, least(coalesce(p_limite, 50), 100))
      for update skip locked
   )
  returning e.id, e.ocorrencia_id, e.andamento_id, e.motivo, e.destinatario;
end;
$$;

comment on function public.reservar_emails_de_ocorrencia(integer, text[]) is
  'Entrega um lote de e-mails de ocorrencia para envio (status ENVIANDO), sem repetir entre chamadas simultaneas. So o service_role executa. Ver migration 0065.';

revoke all on function public.reservar_emails_de_ocorrencia(integer, text[]) from public, anon, authenticated;
grant execute on function public.reservar_emails_de_ocorrencia(integer, text[]) to service_role;
