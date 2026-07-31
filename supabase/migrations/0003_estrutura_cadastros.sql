-- ============================================================================
-- VeloxLab — Estrutura de cadastros
--
-- Primeira leva do modelo operacional: hierarquia de sites, QR codes e a
-- reestruturacao de perfis conforme o sistema de referencia (UP Servicos).
--
-- Hierarquia: grupos_sites (cliente) -> sites (unidade) -> qr_codes (etiqueta)
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Tabelas de apoio --------------------------------------------------------

create table if not exists public.tipos_servico (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 2) Hierarquia de sites -----------------------------------------------------

create table if not exists public.grupos_sites (
  id bigint generated always as identity primary key,
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table public.grupos_sites is
  'Cliente que agrupa unidades. Ex: Cooperativa de Credito Cooplivre.';

create table if not exists public.sites (
  id bigint generated always as identity primary key,
  grupo_site_id bigint not null references public.grupos_sites (id) on delete restrict,
  nome text not null,
  sigla text,
  regional text,
  -- Coordenadas do site. Nulas quando ainda nao foram cadastradas.
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  cidade text,
  uf char(2),
  observacao text,
  tipo_servico_id bigint references public.tipos_servico (id) on delete set null,
  responsavel_id uuid references public.profiles (id) on delete set null,
  -- Desativacao por flag. O sistema de origem renomeava o site com sufixo
  -- ".INATIVO", pratica que nao se repete aqui.
  ativo boolean not null default true,
  criado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now()
);

comment on table public.sites is
  'Unidade atendida. Corresponde a coluna "Local" nas telas de coletas.';

create index if not exists sites_grupo_site_id_idx on public.sites (grupo_site_id);
create index if not exists sites_ativo_idx on public.sites (ativo) where ativo;

-- 3) QR codes ----------------------------------------------------------------
-- Um QR identifica o site inteiro: e lido na chegada e na saida da visita.

create table if not exists public.qr_codes (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  site_id bigint not null references public.sites (id) on delete cascade,
  finalidade text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists qr_codes_site_id_idx on public.qr_codes (site_id);

-- 4) Perfis: niveis de acesso reais e hierarquia -----------------------------
-- O sistema de referencia separa "Nivel de Acesso" (permissao, lista fechada)
-- de "Funcao" (cargo descritivo, texto livre). O modelo anterior misturava
-- os dois numa coluna `cargo`.

alter table public.profiles add column if not exists funcao text;
alter table public.profiles add column if not exists login text;
alter table public.profiles add column if not exists ativo boolean not null default true;
alter table public.profiles
  add column if not exists superior_id uuid references public.profiles (id) on delete set null;

-- Converte os valores antigos antes de trocar a restricao, para nao invalidar
-- registros ja existentes.
alter table public.profiles drop constraint if exists profiles_cargo_check;

update public.profiles set cargo = 'GESTOR'     where cargo = 'Administrador';
update public.profiles set cargo = 'SUPERVISOR' where cargo = 'Supervisor';
update public.profiles set cargo = 'OPERADOR'   where cargo = 'Operador';

alter table public.profiles
  add constraint profiles_cargo_check
  check (cargo in ('OPERADOR', 'CLIENTE', 'GESTOR', 'OPERACIONAL', 'SUPERVISOR'));

alter table public.profiles alter column cargo set default 'OPERADOR';

comment on column public.profiles.cargo is
  'Nivel de acesso: OPERADOR, CLIENTE, GESTOR, OPERACIONAL ou SUPERVISOR.';
comment on column public.profiles.funcao is
  'Cargo descritivo, texto livre. Ex: Ronda, Lider de limpeza.';

-- 4.1) Atualiza o trigger de criacao de perfil -------------------------------
-- A versao da migration 0001 usava o default 'Operador', grafia que a nova
-- restricao rejeita. Sem esta atualizacao, todo cadastro novo falharia.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo, cargo, funcao, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'cargo', 'OPERADOR'),
    new.raw_user_meta_data ->> 'funcao',
    new.email
  );
  return new;
end;
$$;

-- 5) Grupos de usuarios (muitos-para-muitos) ---------------------------------

create table if not exists public.grupos_usuarios (
  id bigint generated always as identity primary key,
  nome text not null unique,
  descricao text,
  criado_em timestamptz not null default now()
);

create table if not exists public.grupos_usuarios_membros (
  grupo_id bigint not null references public.grupos_usuarios (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (grupo_id, profile_id)
);

create index if not exists grupos_usuarios_membros_profile_idx
  on public.grupos_usuarios_membros (profile_id);

-- 6) Row Level Security ------------------------------------------------------
-- Leitura liberada para usuarios autenticados: sao dados de referencia usados
-- nos filtros. Escrita nao recebe policy, portanto fica negada via API e
-- ocorre apenas pelo painel, SQL ou service_role -- mesmo criterio adotado
-- para a coluna `cargo` na migration 0002.

alter table public.tipos_servico enable row level security;
alter table public.grupos_sites enable row level security;
alter table public.sites enable row level security;
alter table public.qr_codes enable row level security;
alter table public.grupos_usuarios enable row level security;
alter table public.grupos_usuarios_membros enable row level security;

drop policy if exists "Leitura para autenticados" on public.tipos_servico;
create policy "Leitura para autenticados" on public.tipos_servico
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.grupos_sites;
create policy "Leitura para autenticados" on public.grupos_sites
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.sites;
create policy "Leitura para autenticados" on public.sites
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.qr_codes;
create policy "Leitura para autenticados" on public.qr_codes
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.grupos_usuarios;
create policy "Leitura para autenticados" on public.grupos_usuarios
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.grupos_usuarios_membros;
create policy "Leitura para autenticados" on public.grupos_usuarios_membros
  for select to authenticated using (true);

-- 7) Reafirma as permissoes de coluna da migration 0002 ----------------------
-- As colunas novas de `profiles` nasceriam sem grant algum; `funcao` e `login`
-- sao editaveis pelo proprio usuario, `cargo` e `superior_id` nao.

revoke update on public.profiles from authenticated;
grant update (nome_completo, funcao, login) on public.profiles to authenticated;
