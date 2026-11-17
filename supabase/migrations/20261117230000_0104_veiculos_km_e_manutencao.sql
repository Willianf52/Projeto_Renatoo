-- ============================================================================
-- 0104: veiculos, km e manutencao, com aviso de revisao aos 9.000 km
--
-- Pedido do gestor (16/11/2026, autorizado em 17/11): cadastro de veiculo
-- (modelo, placa, cor, empresa), historico de km e de manutencao, revisao a
-- cada 10.000 km com aviso aos 9.000.
--
-- Decisoes do dono (16/11):
--   * Manutencao de VEICULO: so cargos da UP (nao CLIENTE).
--   * O aviso dos 9.000 km vai a GESTOR, SUPERVISOR e OPERADOR ativos, pela
--     caixa de notificacoes (0103), no portal e no app.
--   * O veiculo e de uma pessoa (o "veiculo do Sup/Usuario"): `usuario_id`,
--     no maximo um veiculo ativo por pessoa. O app vai pedir o km dele ao
--     abrir (PR seguinte).
--
-- Regras:
--   * Le: qualquer pessoa ativa da UP (nao CLIENTE).
--   * Cadastra e edita o veiculo: quem administra cadastros (GESTOR,
--     SUPERVISOR, OPERACIONAL).
--   * Registra km e manutencao: qualquer pessoa ativa da UP. `registrado_por`
--     e sempre quem esta logado (default + fora do grant).
--   * `km_atual` so muda pelo banco: o maior km ja registrado. Km menor que o
--     ultimo e recusado (odometro nao anda para tras; um erro de digitacao
--     travaria o aviso).
--   * Manutencao do tipo REVISAO com km zera a contagem: `km_ultima_revisao`
--     passa a ser esse km. O cadastro tambem informa o km da ultima revisao,
--     para o veiculo que ja chega rodado.
--   * O aviso sai uma vez por ciclo de revisao (chave com o km da revisao).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.veiculos (
  id bigint generated always as identity primary key,
  -- Sem hifen e em maiusculas: ABC1234 (antiga) ou ABC1D23 (Mercosul).
  placa text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo text not null check (char_length(btrim(modelo)) between 1 and 80),
  cor text not null default '' check (char_length(cor) <= 40),
  empresa text not null default '' check (char_length(empresa) <= 120),
  usuario_id uuid references public.profiles (id) on delete set null,
  km_atual integer not null default 0 check (km_atual between 0 and 2000000),
  km_ultima_revisao integer not null default 0 check (km_ultima_revisao between 0 and 2000000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint veiculos_placa_unica unique (placa)
);

comment on table public.veiculos is
  'Veiculos da operacao (pedido do gestor, 0104): revisao a cada 10.000 km, aviso aos 9.000.';

create unique index if not exists veiculos_um_ativo_por_usuario
  on public.veiculos (usuario_id) where usuario_id is not null and ativo;

create table if not exists public.veiculo_km (
  id bigint generated always as identity primary key,
  veiculo_id bigint not null references public.veiculos (id) on delete cascade,
  km integer not null check (km between 0 and 2000000),
  registrado_por uuid not null default auth.uid() references public.profiles (id),
  registrado_em timestamptz not null default now()
);

create index if not exists veiculo_km_veiculo_idx on public.veiculo_km (veiculo_id, registrado_em desc);

create table if not exists public.veiculo_manutencoes (
  id bigint generated always as identity primary key,
  veiculo_id bigint not null references public.veiculos (id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('REVISAO', 'PREVENTIVA', 'CORRETIVA', 'OUTRA')),
  km integer check (km is null or km between 0 and 2000000),
  descricao text not null default '' check (char_length(descricao) <= 1000),
  registrado_por uuid not null default auth.uid() references public.profiles (id),
  criado_em timestamptz not null default now()
);

create index if not exists veiculo_manutencoes_veiculo_idx on public.veiculo_manutencoes (veiculo_id, data desc);

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
alter table public.veiculos enable row level security;
alter table public.veiculo_km enable row level security;
alter table public.veiculo_manutencoes enable row level security;

revoke all on public.veiculos, public.veiculo_km, public.veiculo_manutencoes from anon, authenticated;

grant select on public.veiculos, public.veiculo_km, public.veiculo_manutencoes to authenticated;
-- km_atual fica fora: so o banco o atualiza.
grant insert (placa, modelo, cor, empresa, usuario_id, km_ultima_revisao, ativo) on public.veiculos to authenticated;
grant update (placa, modelo, cor, empresa, usuario_id, km_ultima_revisao, ativo) on public.veiculos to authenticated;
-- registrado_por fica fora: e sempre o default auth.uid().
grant insert (veiculo_id, km) on public.veiculo_km to authenticated;
grant insert (veiculo_id, data, tipo, km, descricao) on public.veiculo_manutencoes to authenticated;

drop policy if exists veiculos_ler on public.veiculos;
create policy veiculos_ler on public.veiculos
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop policy if exists veiculos_cadastrar on public.veiculos;
create policy veiculos_cadastrar on public.veiculos
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists veiculos_editar on public.veiculos;
create policy veiculos_editar on public.veiculos
  for update to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists veiculo_km_ler on public.veiculo_km;
create policy veiculo_km_ler on public.veiculo_km
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop policy if exists veiculo_km_registrar on public.veiculo_km;
create policy veiculo_km_registrar on public.veiculo_km
  for insert to authenticated
  with check (
    (select autorizacao.usuario_ativo())
    and not (select autorizacao.e_cliente())
    and registrado_por = (select auth.uid())
  );

drop policy if exists veiculo_manutencoes_ler on public.veiculo_manutencoes;
create policy veiculo_manutencoes_ler on public.veiculo_manutencoes
  for select to authenticated
  using ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()));

drop policy if exists veiculo_manutencoes_registrar on public.veiculo_manutencoes;
create policy veiculo_manutencoes_registrar on public.veiculo_manutencoes
  for insert to authenticated
  with check (
    (select autorizacao.usuario_ativo())
    and not (select autorizacao.e_cliente())
    and registrado_por = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Km e revisao: o banco mantem km_atual e km_ultima_revisao
-- ---------------------------------------------------------------------------
create or replace function manutencao.km_do_veiculo()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_atual integer;
begin
  select km_atual into v_atual from public.veiculos where id = new.veiculo_id for update;
  if new.km < v_atual then
    raise exception 'KM_MENOR_QUE_O_ULTIMO: o km informado (%) e menor que o ultimo registrado (%).', new.km, v_atual
      using errcode = '22023';
  end if;
  update public.veiculos set km_atual = new.km where id = new.veiculo_id and km_atual < new.km;
  return new;
end;
$$;

revoke all on function manutencao.km_do_veiculo() from public, anon, authenticated;

drop trigger if exists veiculo_km_atualiza_veiculo on public.veiculo_km;
create trigger veiculo_km_atualiza_veiculo
  before insert on public.veiculo_km
  for each row execute function manutencao.km_do_veiculo();

create or replace function manutencao.revisao_do_veiculo()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if new.tipo = 'REVISAO' and new.km is not null then
    update public.veiculos
       set km_ultima_revisao = greatest(km_ultima_revisao, new.km),
           km_atual = greatest(km_atual, new.km)
     where id = new.veiculo_id;
  elsif new.km is not null then
    update public.veiculos set km_atual = new.km where id = new.veiculo_id and km_atual < new.km;
  end if;
  return null;
end;
$$;

revoke all on function manutencao.revisao_do_veiculo() from public, anon, authenticated;

drop trigger if exists veiculo_manutencao_atualiza_veiculo on public.veiculo_manutencoes;
create trigger veiculo_manutencao_atualiza_veiculo
  after insert on public.veiculo_manutencoes
  for each row execute function manutencao.revisao_do_veiculo();

-- ---------------------------------------------------------------------------
-- Aviso aos 9.000 km desde a ultima revisao
-- ---------------------------------------------------------------------------
create or replace function manutencao.avisar_revisao_do_veiculo()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_rodados integer := new.km_atual - new.km_ultima_revisao;
begin
  if new.ativo and v_rodados >= 9000 then
    perform manutencao.notificar(
      array(
        select p.id from public.profiles p
         where p.ativo and p.cargo in ('GESTOR', 'SUPERVISOR', 'OPERADOR')
      ),
      'REVISAO_VEICULO',
      format('Revisão do veículo %s', new.placa),
      format(
        '%s está com %s km, %s desde a última revisão. A revisão é a cada 10.000 km.',
        new.modelo,
        replace(to_char(new.km_atual, 'FM999,999,999'), ',', '.'),
        replace(to_char(v_rodados, 'FM999,999,999'), ',', '.')
      ),
      format('/dashboard/cadastros/veiculos/%s', new.id),
      format('revisao:veiculo:%s:%s', new.id, new.km_ultima_revisao)
    );
  end if;
  return null;
exception when others then
  -- O aviso nunca recusa o km nem a manutencao.
  raise warning 'avisar_revisao_do_veiculo: aviso nao criado (veiculo %): %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function manutencao.avisar_revisao_do_veiculo() from public, anon, authenticated;

drop trigger if exists veiculo_aviso_de_revisao on public.veiculos;
create trigger veiculo_aviso_de_revisao
  after insert or update of km_atual, km_ultima_revisao, ativo on public.veiculos
  for each row execute function manutencao.avisar_revisao_do_veiculo();

-- ---------------------------------------------------------------------------
-- Auditoria, como os demais cadastros
-- ---------------------------------------------------------------------------
drop trigger if exists auditoria_trigger on public.veiculos;
create trigger auditoria_trigger
  after insert or update or delete on public.veiculos
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.veiculo_manutencoes;
create trigger auditoria_trigger
  after insert or update or delete on public.veiculo_manutencoes
  for each row execute function public.registrar_auditoria();
