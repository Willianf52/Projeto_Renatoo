-- ============================================================================
-- 0113: os clientes que cada supervisor (ou usuario) atende
--
-- Pedido do gestor (16/11/2026), Fase 2 da #318: o "Cadastro Sup/Usuario" tem
-- os clientes, o veiculo, os dados e a foto. Clientes = os grupos de sites
-- (decisao do dono, 16/11); "os clientes que o supervisor atende" (22/11).
--
-- Nesta versao e CADASTRO E CONSULTA: nao muda o que a pessoa enxerga nem o
-- que recebe. O escopo do CLIENTE continua sendo `grupos_sites_clientes`
-- (0014), que e outra coisa (o que a conta de cliente pode ver).
--
-- Quem le: qualquer pessoa ativa da UP. Quem edita: o GESTOR, sempre pela
-- lista inteira de uma vez (`salvar_clientes_atendidos`, transacional).
-- ============================================================================

create table if not exists public.clientes_atendidos (
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  grupo_site_id bigint not null references public.grupos_sites (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (usuario_id, grupo_site_id)
);

comment on table public.clientes_atendidos is
  'Grupos de sites (clientes) que cada pessoa atende; cadastro e consulta, nao muda o escopo de visao (0113).';

create index if not exists clientes_atendidos_grupo_idx on public.clientes_atendidos (grupo_site_id);

alter table public.clientes_atendidos enable row level security;
revoke all on public.clientes_atendidos from anon, authenticated;
grant select on public.clientes_atendidos to authenticated;

drop policy if exists clientes_atendidos_ler on public.clientes_atendidos;
create policy clientes_atendidos_ler on public.clientes_atendidos
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop trigger if exists auditoria_trigger on public.clientes_atendidos;
create trigger auditoria_trigger
  after insert or update or delete on public.clientes_atendidos
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- Gravacao: a lista inteira de uma vez, so o GESTOR
-- ---------------------------------------------------------------------------
create or replace function escrita.salvar_clientes_atendidos(p_usuario_id uuid, p_grupos bigint[])
returns void
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
begin
  if auth.uid() is null or not autorizacao.pode_administrar_usuarios() then
    raise exception 'Sem permissão para editar os clientes atendidos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario_id) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  delete from public.clientes_atendidos
   where usuario_id = p_usuario_id
     and not (grupo_site_id = any (coalesce(p_grupos, '{}')));

  insert into public.clientes_atendidos (usuario_id, grupo_site_id)
  select p_usuario_id, g.id
    from public.grupos_sites g
   where g.id = any (coalesce(p_grupos, '{}'))
  on conflict do nothing;
end;
$$;

revoke all on function escrita.salvar_clientes_atendidos(uuid, bigint[]) from public, anon, authenticated;
grant execute on function escrita.salvar_clientes_atendidos(uuid, bigint[]) to authenticated;

create or replace function public.salvar_clientes_atendidos(p_usuario_id uuid, p_grupos bigint[])
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.salvar_clientes_atendidos(p_usuario_id, p_grupos);
$$;

comment on function public.salvar_clientes_atendidos(uuid, bigint[]) is 'Envelope de escrita.salvar_clientes_atendidos -- migration 0113.';

revoke all on function public.salvar_clientes_atendidos(uuid, bigint[]) from public, anon;
grant execute on function public.salvar_clientes_atendidos(uuid, bigint[]) to authenticated;
