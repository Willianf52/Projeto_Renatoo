-- ============================================================================
-- 0068 -- Usuarios: dados pessoais e "Enviar E-mail para o Superior?"
--
-- ISSUE #177, TERCEIRO ITEM. O cadastro de usuarios do sistema de referencia
-- tem CPF, R.E., Telefone e Celular, e um bloco "Enviar E-mail para o
-- Superior?" com tres caixas: Ocorrencia, Checklist/ChecklistLab e Evento.
-- Lido em 07/10/2026: as caixas ficam ao lado de "Usuario Superior" -- quando
-- ESTE usuario gera aquilo, o SUPERIOR dele recebe um e-mail.
--
-- DECISOES DO DONO (07/10/2026):
--   - as tres caixas ficam gravadas;
--   - "Evento" envia: a ocorrencia que o usuario abre (0063 -- as ocorrencias
--     daqui sao os "Eventos" de la) avisa o superior, junto com os contatos
--     do site (0065);
--   - "Checklist" envia: o checklist que o usuario envia avisa o superior;
--   - "Ocorrencia" fica so gravada -- o modulo de Ocorrencias do sistema de
--     referencia nao existe aqui;
--   - CPF, RE, telefone e celular: so quem administra usuarios (GESTOR) ve.
--
-- DADOS PESSOAIS EM TABELA PROPRIA, sem policy nenhuma para `authenticated`:
-- nem a propria pessoa nem a gestao os le pela API. Quem le e escreve e
-- `cadastros/usuarios`, com a service_role, atras de
-- `pode_administrar_usuarios()` -- o mesmo portao das colunas de poder do
-- perfil. Em `profiles` eles ficariam a um `grant select` de distancia de
-- todo SUPERVISOR que le a lista da operacao (0006).
--
-- E-MAIL DO CHECKLIST: fila propria (`checklist_emails`), no molde da
-- `ocorrencia_emails` (0065), com o mesmo aviso ao portal e o mesmo envio --
-- a rota e o cron da 0065 esvaziam as duas filas.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Dados pessoais -------------------------------------------------------------------
-- So digitos: a tela formata. CPF com o digito verificador conferido na action.

create table if not exists public.dados_pessoais_dos_usuarios (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  cpf text,
  re text,
  telefone text,
  celular text,
  atualizado_em timestamptz not null default now(),
  constraint dados_pessoais_cpf_valido check (cpf ~ '^[0-9]{11}$'),
  constraint dados_pessoais_re_valido check (length(btrim(re)) between 1 and 30),
  constraint dados_pessoais_telefone_valido check (telefone ~ '^[0-9]{10,11}$'),
  constraint dados_pessoais_celular_valido check (celular ~ '^[0-9]{10,11}$')
);

comment on table public.dados_pessoais_dos_usuarios is
  'CPF, RE, telefone e celular do usuario ("Dados pessoais" do cadastro). Sem policy para authenticated: so a service_role, atras de pode_administrar_usuarios(). Ver migration 0068.';

alter table public.dados_pessoais_dos_usuarios enable row level security;

revoke all on public.dados_pessoais_dos_usuarios from anon, authenticated;
grant all on public.dados_pessoais_dos_usuarios to service_role;

-- 2) As tres caixas no perfil ---------------------------------------------------------
-- Grants coluna a coluna, como as vizinhas (ver a 0058): leitura para todos os
-- papeis, escrita so para a service_role.

alter table public.profiles
  add column if not exists email_superior_ocorrencia boolean not null default false,
  add column if not exists email_superior_checklist boolean not null default false,
  add column if not exists email_superior_evento boolean not null default false;

comment on column public.profiles.email_superior_ocorrencia is
  '"Enviar E-mail para o Superior?" > Ocorrencia. So gravada: o modulo de Ocorrencias do sistema de referencia nao existe aqui. Ver migration 0068.';
comment on column public.profiles.email_superior_checklist is
  '"Enviar E-mail para o Superior?" > Checklist: o checklist que este usuario envia avisa o superior. Ver migration 0068.';
comment on column public.profiles.email_superior_evento is
  '"Enviar E-mail para o Superior?" > Evento: a ocorrencia que este usuario abre avisa o superior. Ver migration 0068.';

grant select (email_superior_ocorrencia, email_superior_checklist, email_superior_evento)
  on public.profiles to anon, authenticated, service_role;
grant insert (email_superior_ocorrencia, email_superior_checklist, email_superior_evento),
      update (email_superior_ocorrencia, email_superior_checklist, email_superior_evento)
  on public.profiles to service_role;

-- 3) Evento: a abertura da ocorrencia avisa tambem o superior ----------------------
-- Mesma funcao da 0065, com o superior de quem abriu (`aberta_por`, o
-- funcionario da visita) somado aos contatos do site. Superior inativo, sem
-- e-mail ou a propria pessoa nao recebem. Repetido sai uma vez so.

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

revoke all on function manutencao.emails_da_abertura_da_ocorrencia() from public, anon, authenticated;

-- 4) Checklist: fila propria ---------------------------------------------------------

create table if not exists public.checklist_emails (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references public.checklists_visita (id) on delete cascade,
  destinatario text not null check (length(destinatario) <= 254),
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHOU', 'DESCARTADO')),
  tentativas smallint not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  id_externo text
);

comment on table public.checklist_emails is
  'E-mail ao superior de quem enviou o checklist ("Enviar E-mail para o Superior?" > Checklist): fila de envio. So o service_role le e escreve. Ver migration 0068.';

create index if not exists checklist_emails_checklist_idx on public.checklist_emails (checklist_id);
create index if not exists checklist_emails_fila_idx on public.checklist_emails (id) where status in ('PENDENTE', 'ENVIANDO');

alter table public.checklist_emails enable row level security;

revoke all on public.checklist_emails from anon, authenticated;
grant all on public.checklist_emails to service_role;

-- Quem recebe: o superior do funcionario da visita, se ele marcou a caixa. Como
-- na 0065, um problema aqui nunca recusa o envio do checklist pelo inspetor.
create or replace function manutencao.email_do_checklist_ao_superior()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  begin
    insert into public.checklist_emails (checklist_id, destinatario)
    select new.id, lower(btrim(superior.email))
      from public.visitas v
      join public.profiles autor on autor.id = v.funcionario_id
      join public.profiles superior on superior.id = autor.superior_id
     where v.id = new.visita_id
       and autor.email_superior_checklist
       and superior.ativo
       and superior.id <> autor.id
       and coalesce(btrim(superior.email), '') <> '';
  exception when others then
    raise warning 'email_do_checklist_ao_superior: e-mail nao enfileirado (checklist %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function manutencao.email_do_checklist_ao_superior() from public, anon, authenticated;

drop trigger if exists email_do_checklist_ao_superior on public.checklists_visita;
create trigger email_do_checklist_ao_superior
  after insert on public.checklists_visita
  for each row execute function manutencao.email_do_checklist_ao_superior();

-- O mesmo aviso ao portal da 0065: a rota esvazia as duas filas.
drop trigger if exists avisar_portal_dos_emails_de_checklist on public.checklist_emails;
create trigger avisar_portal_dos_emails_de_checklist
  after insert on public.checklist_emails
  referencing new table as novos_emails
  for each statement execute function manutencao.avisar_portal_dos_emails_de_ocorrencia();

-- Mesma reserva da 0065, sobre a fila do checklist.
create or replace function public.reservar_emails_de_checklist(
  p_limite integer default 50,
  p_somente text[] default null
)
returns table (id bigint, checklist_id bigint, destinatario text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  update public.checklist_emails
     set status = case when tentativas >= 3 then 'FALHOU' else 'PENDENTE' end,
         erro = coalesce(erro, 'envio interrompido')
   where status = 'ENVIANDO'
     and reservado_em < now() - interval '10 minutes';

  update public.checklist_emails
     set status = 'DESCARTADO',
         erro = 'Não enviado em 3 dias: o domínio de e-mail ainda não estava configurado.'
   where status = 'PENDENTE'
     and criado_em < now() - interval '3 days';

  return query
  update public.checklist_emails e
     set status = 'ENVIANDO',
         tentativas = e.tentativas + 1,
         reservado_em = now()
   where e.id in (
     select x.id
       from public.checklist_emails x
      where x.status = 'PENDENTE'
        and (p_somente is null or x.destinatario = any (p_somente))
      order by x.id
      limit greatest(1, least(coalesce(p_limite, 50), 100))
      for update skip locked
   )
  returning e.id, e.checklist_id, e.destinatario;
end;
$$;

comment on function public.reservar_emails_de_checklist(integer, text[]) is
  'Entrega um lote de e-mails de checklist para envio (status ENVIANDO), sem repetir entre chamadas simultaneas. So o service_role executa. Ver migration 0068.';

revoke all on function public.reservar_emails_de_checklist(integer, text[]) from public, anon, authenticated;
grant execute on function public.reservar_emails_de_checklist(integer, text[]) to service_role;
