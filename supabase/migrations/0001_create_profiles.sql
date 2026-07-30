-- ============================================================================
-- VeloxLab — Perfis de usuário
-- Tabela public.profiles vinculada a auth.users, com criação automática via
-- trigger e políticas de Row Level Security (RLS).
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Tabela de perfis --------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text,
  cargo text not null default 'Operador'
    check (cargo in ('Administrador', 'Supervisor', 'Operador')),
  email text not null,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfis de usuário do VeloxLab, um por registro em auth.users.';
comment on column public.profiles.cargo is
  'Nível de acesso do usuário: Administrador, Supervisor ou Operador.';

-- 2) Criação automática de perfil ao cadastrar um usuário -------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo, cargo, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'cargo', 'Operador'),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 3) Row Level Security ------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "Perfis visíveis para usuários autenticados" on public.profiles;

create policy "Perfis visíveis para usuários autenticados"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Usuário atualiza apenas o próprio perfil" on public.profiles;

create policy "Usuário atualiza apenas o próprio perfil"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
