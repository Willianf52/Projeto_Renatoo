-- ============================================================================
-- VeloxLab — Escopo de cliente
--
-- `CLIENTE` estava no check de `profiles_cargo_check` desde a 0003 e era
-- selecionavel na tela de Usuarios, mas nao aparecia em policy nenhuma. O
-- efeito pratico: como `pode_ver_toda_operacao()` e so GESTOR/SUPERVISOR e a
-- policy de `visitas` (0006) cai em `funcionario_id = auth.uid()`, um CLIENTE
-- logava e via a tela de coletas **vazia** -- nao "restrita": vazia, sem nada
-- explicando por que.
--
-- No sistema de referencia o cliente enxerga a operacao dos proprios sites.
-- Faltava o vinculo entre o perfil e o grupo de sites que ele representa.
--
-- Isto e paridade e e seguranca ao mesmo tempo. Hoje as policies de `sites`,
-- `grupos_sites` e `qr_codes` sao `usuario_ativo()` -- sem recorte nenhum.
-- Ativar um CLIENTE pela tela nova de Usuarios entregaria a ele a lista de
-- sites de TODOS os clientes, com latitude e longitude, mais o codigo de todo
-- checkpoint. E exatamente o vazamento que a 0008 fechou para conta criada de
-- fora; a diferenca e que aqui a conta e legitima e o dado e que nao devia
-- ser dela.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Vinculo -----------------------------------------------------------------
-- N:N e nao uma coluna em `profiles`: um contato de holding acompanha mais de
-- um grupo, e comecar 1:1 obrigaria a migrar dado depois. Mesma forma de
-- `grupos_usuarios_membros` (0003), inclusive na ordem da chave primaria.

create table if not exists public.grupos_sites_clientes (
  grupo_site_id bigint not null references public.grupos_sites (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (grupo_site_id, profile_id)
);

comment on table public.grupos_sites_clientes is
  'Grupos de sites que um perfil CLIENTE enxerga. Sem vinculo, um CLIENTE nao
   ve operacao nenhuma -- o que e o padrao seguro: conceder e um ato
   deliberado, como a ativacao da conta na 0008.';

-- A PK ja cobre buscas por grupo; o indice inverso serve as policies abaixo,
-- que todas partem de `profile_id = auth.uid()`.
create index if not exists grupos_sites_clientes_profile_idx
  on public.grupos_sites_clientes (profile_id);

alter table public.grupos_sites_clientes enable row level security;

-- Leitura: o proprio vinculo ou gestao. Escrita nao recebe policy -- o vinculo
-- e gravado com service_role pela tela de Usuarios, mesmo caminho de `cargo` e
-- `ativo` e pelo mesmo motivo (0013): conceder escopo e conceder acesso.
drop policy if exists "Leitura do proprio vinculo ou de gestao" on public.grupos_sites_clientes;
create policy "Leitura do proprio vinculo ou de gestao" on public.grupos_sites_clientes
  for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and profile_id = auth.uid()));

-- 2) Helpers -----------------------------------------------------------------

create or replace function public.e_cliente()
returns boolean
language sql
security definer
stable
set search_path = public
as $$ select public.nivel_acesso_atual() = 'CLIENTE'; $$;

comment on function public.e_cliente() is
  'Verdadeiro quando o usuario atual tem nivel CLIENTE, o unico com escopo
   restrito a grupos de sites especificos.';

/**
 * O predicado usado por todas as policies abaixo.
 *
 * Escrito como "nao e cliente OU o grupo esta entre os dele" de proposito: quem
 * nao e CLIENTE mantem exatamente a visao de antes desta migration, sem
 * depender de vinculo nenhum. So o ramo do cliente e novo, entao nada que
 * funcionava passa a depender de dado que ninguem cadastrou ainda.
 */
create or replace function public.pode_ver_grupo_site(id_do_grupo bigint)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_ativo()
    and (
      not public.e_cliente()
      or exists (
        select 1 from public.grupos_sites_clientes v
        where v.profile_id = auth.uid()
          and v.grupo_site_id = id_do_grupo
      )
    );
$$;

revoke all on function public.e_cliente() from public;
revoke all on function public.pode_ver_grupo_site(bigint) from public;
grant execute on function public.e_cliente() to authenticated;
grant execute on function public.pode_ver_grupo_site(bigint) to authenticated;

-- 3) Recorte das tabelas de cadastro -----------------------------------------
-- Substituem as policies `usuario_ativo()` da 0006. Para todo mundo que nao e
-- CLIENTE o resultado e identico ao de antes.

drop policy if exists "Leitura para usuarios ativos" on public.grupos_sites;
drop policy if exists "Leitura dos grupos no escopo" on public.grupos_sites;
create policy "Leitura dos grupos no escopo" on public.grupos_sites
  for select to authenticated
  using (public.pode_ver_grupo_site(id));

drop policy if exists "Leitura para usuarios ativos" on public.sites;
drop policy if exists "Leitura dos sites no escopo" on public.sites;
create policy "Leitura dos sites no escopo" on public.sites
  for select to authenticated
  using (public.pode_ver_grupo_site(grupo_site_id));

-- `qr_codes` chega ao grupo pelo site. A 0008 registra que a lista de
-- checkpoints e justamente o que nao pode vazar.
drop policy if exists "Leitura para usuarios ativos" on public.qr_codes;
drop policy if exists "Leitura dos qr codes no escopo" on public.qr_codes;
create policy "Leitura dos qr codes no escopo" on public.qr_codes
  for select to authenticated
  using (exists (
    select 1 from public.sites s
    where s.id = qr_codes.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
  ));

-- 4) Recorte da operacao -----------------------------------------------------
-- Acrescenta o ramo do cliente as policies da 0006, sem mexer nos dois que ja
-- existiam (gestao ve tudo; o funcionario ve as proprias visitas).

drop policy if exists "Leitura da propria operacao ou de gestao" on public.visitas;
drop policy if exists "Leitura da operacao no escopo" on public.visitas;
create policy "Leitura da operacao no escopo" on public.visitas
  for select to authenticated
  using (
    public.pode_ver_toda_operacao()
    or (public.usuario_ativo() and funcionario_id = auth.uid())
    or (public.e_cliente() and exists (
      select 1 from public.sites s
      where s.id = visitas.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
    ))
  );

drop policy if exists "Leitura da propria operacao ou de gestao" on public.leituras;
drop policy if exists "Leitura das leituras no escopo" on public.leituras;
create policy "Leitura das leituras no escopo" on public.leituras
  for select to authenticated
  using (
    public.pode_ver_toda_operacao()
    or exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id
        and (
          (public.usuario_ativo() and v.funcionario_id = auth.uid())
          or (public.e_cliente() and exists (
            select 1 from public.sites s
            where s.id = v.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
          ))
        )
    )
  );

-- `metas_visitas` segue so para gestao (0006). O cliente ve o que foi
-- executado, nao a meta contratada -- sao dois assuntos, e abrir o segundo e
-- decisao de produto que ninguem tomou.
