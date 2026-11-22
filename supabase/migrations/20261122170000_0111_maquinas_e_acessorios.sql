-- ============================================================================
-- 0111: maquinas (com historico de manutencao) e acessorios e produtos, por site
--
-- Pedido do gestor (16/11/2026), Fase 2 da #318:
--   * Cadastro de maquina: modelo, ativo (patrimonio), historico de manutencao
--     preventiva e autonoma (e corretiva). A maquina e de um SITE (dono,
--     22/11/2026).
--   * Acessorios e produtos: lista por site (dono, 22/11/2026): tipo, nome,
--     quantidade e observacao.
--
-- Decisoes do dono (16/11):
--   * Manutencao de MAQUINA: todos os cargos registram, ate o CLIENTE, dentro
--     do escopo dele (os sites que ele enxerga).
--   * O cadastro da maquina e da lista de acessorios fica com quem administra
--     cadastros (GESTOR, SUPERVISOR, OPERACIONAL), como o Site/Planta.
--
-- Quem le: quem enxerga o site (o CLIENTE, so os do seu escopo; 0014).
-- ============================================================================

-- O site e visivel para quem pede? Mesma regra do Site/Planta (0014).
create or replace function autorizacao.pode_ver_site(id_do_site bigint)
returns boolean
language sql
stable
security definer
set search_path = autorizacao, public, pg_temp
as $$
  select exists (
    select 1 from public.sites s
     where s.id = id_do_site
       and autorizacao.pode_ver_grupo_site(s.grupo_site_id)
  );
$$;

revoke all on function autorizacao.pode_ver_site(bigint) from public, anon;
grant execute on function autorizacao.pode_ver_site(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Maquinas
-- ---------------------------------------------------------------------------
create table if not exists public.maquinas (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.sites (id) on delete cascade,
  modelo text not null check (char_length(btrim(modelo)) between 1 and 120),
  -- O "ativo" da folha do gestor: o numero de patrimonio.
  patrimonio text not null default '' check (char_length(patrimonio) <= 60),
  descricao text not null default '' check (char_length(descricao) <= 500),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table public.maquinas is
  'Maquinas de cada site (pedido do gestor, 0111): modelo, patrimonio e historico de manutencao.';

create index if not exists maquinas_site_idx on public.maquinas (site_id);
create unique index if not exists maquinas_patrimonio_unico
  on public.maquinas (upper(btrim(patrimonio))) where btrim(patrimonio) <> '';

create table if not exists public.maquina_manutencoes (
  id bigint generated always as identity primary key,
  maquina_id bigint not null references public.maquinas (id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('PREVENTIVA', 'AUTONOMA', 'CORRETIVA')),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  registrado_por uuid not null default auth.uid() references public.profiles (id),
  criado_em timestamptz not null default now()
);

create index if not exists maquina_manutencoes_maquina_idx on public.maquina_manutencoes (maquina_id, data desc);

-- ---------------------------------------------------------------------------
-- Acessorios e produtos
-- ---------------------------------------------------------------------------
create table if not exists public.site_itens (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.sites (id) on delete cascade,
  tipo text not null check (tipo in ('ACESSORIO', 'PRODUTO')),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  quantidade integer not null default 1 check (quantidade between 0 and 100000),
  observacao text not null default '' check (char_length(observacao) <= 500),
  criado_em timestamptz not null default now()
);

comment on table public.site_itens is
  'Acessorios e produtos de cada site (pedido do gestor, 0111): tipo, nome, quantidade e observacao.';

create index if not exists site_itens_site_idx on public.site_itens (site_id);

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
alter table public.maquinas enable row level security;
alter table public.maquina_manutencoes enable row level security;
alter table public.site_itens enable row level security;

revoke all on public.maquinas, public.maquina_manutencoes, public.site_itens from anon, authenticated;

grant select on public.maquinas, public.maquina_manutencoes, public.site_itens to authenticated;
grant insert (site_id, modelo, patrimonio, descricao, ativo) on public.maquinas to authenticated;
grant update (site_id, modelo, patrimonio, descricao, ativo) on public.maquinas to authenticated;
-- registrado_por fica fora: e sempre o default auth.uid().
grant insert (maquina_id, data, tipo, descricao) on public.maquina_manutencoes to authenticated;
grant insert (site_id, tipo, nome, quantidade, observacao) on public.site_itens to authenticated;
grant update (tipo, nome, quantidade, observacao) on public.site_itens to authenticated;
grant delete on public.site_itens to authenticated;

-- Maquinas: le quem ve o site; cadastra e edita quem administra cadastros.
drop policy if exists maquinas_ler on public.maquinas;
create policy maquinas_ler on public.maquinas
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and autorizacao.pode_ver_site(site_id));

drop policy if exists maquinas_cadastrar on public.maquinas;
create policy maquinas_cadastrar on public.maquinas
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists maquinas_editar on public.maquinas;
create policy maquinas_editar on public.maquinas
  for update to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

-- Manutencao de maquina: todos os cargos, ate o CLIENTE, nos sites que veem.
drop policy if exists maquina_manutencoes_ler on public.maquina_manutencoes;
create policy maquina_manutencoes_ler on public.maquina_manutencoes
  for select to authenticated
  using (
    (select autorizacao.usuario_ativo())
    and exists (select 1 from public.maquinas m where m.id = maquina_id and autorizacao.pode_ver_site(m.site_id))
  );

drop policy if exists maquina_manutencoes_registrar on public.maquina_manutencoes;
create policy maquina_manutencoes_registrar on public.maquina_manutencoes
  for insert to authenticated
  with check (
    (select autorizacao.usuario_ativo())
    and registrado_por = (select auth.uid())
    and exists (select 1 from public.maquinas m where m.id = maquina_id and autorizacao.pode_ver_site(m.site_id))
  );

-- Acessorios e produtos: le quem ve o site; cadastra quem administra cadastros.
drop policy if exists site_itens_ler on public.site_itens;
create policy site_itens_ler on public.site_itens
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and autorizacao.pode_ver_site(site_id));

drop policy if exists site_itens_cadastrar on public.site_itens;
create policy site_itens_cadastrar on public.site_itens
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists site_itens_editar on public.site_itens;
create policy site_itens_editar on public.site_itens
  for update to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists site_itens_apagar on public.site_itens;
create policy site_itens_apagar on public.site_itens
  for delete to authenticated
  using ((select autorizacao.pode_administrar_cadastros()));

-- ---------------------------------------------------------------------------
-- Auditoria, como os demais cadastros
-- ---------------------------------------------------------------------------
drop trigger if exists auditoria_trigger on public.maquinas;
create trigger auditoria_trigger
  after insert or update or delete on public.maquinas
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.maquina_manutencoes;
create trigger auditoria_trigger
  after insert or update or delete on public.maquina_manutencoes
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.site_itens;
create trigger auditoria_trigger
  after insert or update or delete on public.site_itens
  for each row execute function public.registrar_auditoria();
