-- ============================================================================
-- VeloxLab — auth.uid() como InitPlan nas policies de RLS
--
-- Achado pelo advisor de performance do Supabase (`auth_rls_initplan`,
-- 2026-08-16): seis policies chamam `auth.uid()` direto na cláusula, sem
-- envolver em `(select ...)`. O Postgres so trata a chamada como InitPlan
-- (avaliada uma vez por query) quando ela aparece como subquery escalar —
-- `auth.uid()` solto e reavaliado a cada linha varrida pela policy.
--
-- Nenhuma regra de autorizacao muda aqui: `(select auth.uid())` e
-- `auth.uid()` retornam o mesmo valor sempre, a troca e so a forma como o
-- planner enxerga a chamada. Cada `using`/`with check` abaixo e copia exata
-- da definicao anterior (0006/0014), so com essa troca mecanica.
-- ============================================================================

drop policy if exists "Leitura do proprio perfil ou de gestao" on public.profiles;
create policy "Leitura do proprio perfil ou de gestao" on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.pode_ver_toda_operacao());

drop policy if exists "Usuário atualiza apenas o próprio perfil" on public.profiles;
create policy "Usuário atualiza apenas o próprio perfil" on public.profiles for update to authenticated
  using ((select auth.uid()) = id and public.usuario_ativo())
  with check ((select auth.uid()) = id and public.usuario_ativo());

drop policy if exists "Leitura do proprio grupo ou de gestao" on public.grupos_usuarios_membros;
create policy "Leitura do proprio grupo ou de gestao" on public.grupos_usuarios_membros for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and profile_id = (select auth.uid())));

drop policy if exists "Leitura do proprio vinculo ou de gestao" on public.grupos_sites_clientes;
create policy "Leitura do proprio vinculo ou de gestao" on public.grupos_sites_clientes
  for select to authenticated
  using (public.pode_ver_toda_operacao() or (public.usuario_ativo() and profile_id = (select auth.uid())));

drop policy if exists "Leitura da operacao no escopo" on public.visitas;
create policy "Leitura da operacao no escopo" on public.visitas
  for select to authenticated
  using (
    public.pode_ver_toda_operacao()
    or (public.usuario_ativo() and funcionario_id = (select auth.uid()))
    or (public.e_cliente() and exists (
      select 1 from public.sites s
      where s.id = visitas.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
    ))
  );

drop policy if exists "Leitura das leituras no escopo" on public.leituras;
create policy "Leitura das leituras no escopo" on public.leituras
  for select to authenticated
  using (
    public.pode_ver_toda_operacao()
    or exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id
        and (
          (public.usuario_ativo() and v.funcionario_id = (select auth.uid()))
          or (public.e_cliente() and exists (
            select 1 from public.sites s
            where s.id = v.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
          ))
        )
    )
  );
