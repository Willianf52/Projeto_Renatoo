-- A sessão só é útil enquanto o perfil estiver ativo; a regra também vale
-- para leituras feitas diretamente pela API do Supabase.
create or replace function public.usuario_ativo()
returns boolean language sql security definer stable set search_path = public
as $$ select coalesce((select ativo from public.profiles where id = auth.uid()), false); $$;

create or replace function public.pode_ver_toda_operacao()
returns boolean language sql security definer stable set search_path = public
as $$
  select public.usuario_ativo()
    and public.nivel_acesso_atual() in ('GESTOR', 'SUPERVISOR');
$$;

revoke all on function public.usuario_ativo() from public;
revoke all on function public.pode_ver_toda_operacao() from public;
grant execute on function public.usuario_ativo() to authenticated;
grant execute on function public.pode_ver_toda_operacao() to authenticated;

drop policy if exists "Leitura do proprio perfil ou de gestao" on public.profiles;
create policy "Leitura do proprio perfil ou de gestao" on public.profiles for select to authenticated
  using (auth.uid() = id or public.pode_ver_toda_operacao());
drop policy if exists "Usuário atualiza apenas o próprio perfil" on public.profiles;
create policy "Usuário atualiza apenas o próprio perfil" on public.profiles for update to authenticated
  using (auth.uid() = id and public.usuario_ativo())
  with check (auth.uid() = id and public.usuario_ativo());

-- Referências são necessárias nos formulários para qualquer usuário ativo.
drop policy if exists "Leitura para autenticados" on public.tipos_servico;
drop policy if exists "Leitura para usuarios ativos" on public.tipos_servico;
create policy "Leitura para usuarios ativos" on public.tipos_servico for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.grupos_sites;
drop policy if exists "Leitura para usuarios ativos" on public.grupos_sites;
create policy "Leitura para usuarios ativos" on public.grupos_sites for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.sites;
drop policy if exists "Leitura para usuarios ativos" on public.sites;
create policy "Leitura para usuarios ativos" on public.sites for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.qr_codes;
drop policy if exists "Leitura para usuarios ativos" on public.qr_codes;
create policy "Leitura para usuarios ativos" on public.qr_codes for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.areas;
drop policy if exists "Leitura para usuarios ativos" on public.areas;
create policy "Leitura para usuarios ativos" on public.areas for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.motivos_visita;
drop policy if exists "Leitura para usuarios ativos" on public.motivos_visita;
create policy "Leitura para usuarios ativos" on public.motivos_visita for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.eventos;
drop policy if exists "Leitura para usuarios ativos" on public.eventos;
create policy "Leitura para usuarios ativos" on public.eventos for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.acoes;
drop policy if exists "Leitura para usuarios ativos" on public.acoes;
create policy "Leitura para usuarios ativos" on public.acoes for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.qualificadores;
drop policy if exists "Leitura para usuarios ativos" on public.qualificadores;
create policy "Leitura para usuarios ativos" on public.qualificadores for select to authenticated using (public.usuario_ativo());
drop policy if exists "Leitura para autenticados" on public.coletores_dados;
drop policy if exists "Leitura para usuarios ativos" on public.coletores_dados;
create policy "Leitura para usuarios ativos" on public.coletores_dados for select to authenticated using (public.usuario_ativo());

drop policy if exists "Leitura para autenticados" on public.visitas;
drop policy if exists "Leitura da propria operacao ou de gestao" on public.visitas;
create policy "Leitura da propria operacao ou de gestao" on public.visitas for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and funcionario_id = auth.uid()));
drop policy if exists "Leitura para autenticados" on public.leituras;
drop policy if exists "Leitura da propria operacao ou de gestao" on public.leituras;
create policy "Leitura da propria operacao ou de gestao" on public.leituras for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and exists (
    select 1 from public.visitas where visitas.id = leituras.visita_id and visitas.funcionario_id = auth.uid()
  )));
drop policy if exists "Leitura para autenticados" on public.metas_visitas;
drop policy if exists "Leitura de metas para gestao" on public.metas_visitas;
create policy "Leitura de metas para gestao" on public.metas_visitas for select to authenticated using (public.pode_ver_toda_operacao());
drop policy if exists "Leitura para autenticados" on public.grupos_usuarios;
drop policy if exists "Leitura de grupos para gestao" on public.grupos_usuarios;
create policy "Leitura de grupos para gestao" on public.grupos_usuarios for select to authenticated using (public.pode_ver_toda_operacao());
drop policy if exists "Leitura para autenticados" on public.grupos_usuarios_membros;
drop policy if exists "Leitura do proprio grupo ou de gestao" on public.grupos_usuarios_membros;
create policy "Leitura do proprio grupo ou de gestao" on public.grupos_usuarios_membros for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and profile_id = auth.uid()));
