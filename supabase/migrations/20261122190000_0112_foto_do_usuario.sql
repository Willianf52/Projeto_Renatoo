-- ============================================================================
-- 0112: foto do usuario no topo do portal
--
-- Pedido do gestor (16/11/2026), Fase 2 da #318: a foto da pessoa aparece no
-- topo do sistema quando ela entra. Decisao do dono: o GESTOR cadastra ou o
-- proprio usuario coloca (as duas formas).
--
-- Dado pessoal (LGPD; ver docs/lgpd-privacidade.md):
--   * Bucket PRIVADO `fotos-de-usuario`, uma foto por pessoa em
--     `<id da pessoa>/foto`. A tela recebe so um link assinado e temporario.
--   * Ve e troca a foto: a propria pessoa e quem administra usuarios (GESTOR).
--     Ninguem mais.
--   * So imagem (JPEG, PNG, WebP), ate 2 MB.
--   * `fotos_de_usuario` registra quem tem foto e quando mudou (o topo usa
--     para saber se ha foto e para nao servir a antiga do cache).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-de-usuario', 'fotos-de-usuario', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A pasta do arquivo e o id da pessoa; a propria pessoa ou o GESTOR.
drop policy if exists "Foto do usuario: ler" on storage.objects;
create policy "Foto do usuario: ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos-de-usuario'
    and (select autorizacao.usuario_ativo())
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists "Foto do usuario: enviar" on storage.objects;
create policy "Foto do usuario: enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-de-usuario'
    and (select autorizacao.usuario_ativo())
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists "Foto do usuario: trocar" on storage.objects;
create policy "Foto do usuario: trocar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fotos-de-usuario'
    and (select autorizacao.usuario_ativo())
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select autorizacao.pode_administrar_usuarios()))
  )
  with check (
    bucket_id = 'fotos-de-usuario'
    and (select autorizacao.usuario_ativo())
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists "Foto do usuario: remover" on storage.objects;
create policy "Foto do usuario: remover" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos-de-usuario'
    and (select autorizacao.usuario_ativo())
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select autorizacao.pode_administrar_usuarios()))
  );

-- ---------------------------------------------------------------------------
-- Quem tem foto, e desde quando
-- ---------------------------------------------------------------------------
create table if not exists public.fotos_de_usuario (
  usuario_id uuid primary key references public.profiles (id) on delete cascade,
  atualizada_em timestamptz not null default now()
);

comment on table public.fotos_de_usuario is
  'Quem tem foto no bucket privado fotos-de-usuario e quando ela mudou (0112). Ve e troca: a propria pessoa e o GESTOR.';

alter table public.fotos_de_usuario enable row level security;
revoke all on public.fotos_de_usuario from anon, authenticated;
grant select, delete on public.fotos_de_usuario to authenticated;
grant insert (usuario_id, atualizada_em) on public.fotos_de_usuario to authenticated;
grant update (atualizada_em) on public.fotos_de_usuario to authenticated;

drop policy if exists fotos_de_usuario_ler on public.fotos_de_usuario;
create policy fotos_de_usuario_ler on public.fotos_de_usuario
  for select to authenticated
  using (
    (select autorizacao.usuario_ativo())
    and (usuario_id = (select auth.uid()) or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists fotos_de_usuario_gravar on public.fotos_de_usuario;
create policy fotos_de_usuario_gravar on public.fotos_de_usuario
  for insert to authenticated
  with check (
    (select autorizacao.usuario_ativo())
    and (usuario_id = (select auth.uid()) or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists fotos_de_usuario_trocar on public.fotos_de_usuario;
create policy fotos_de_usuario_trocar on public.fotos_de_usuario
  for update to authenticated
  using (
    (select autorizacao.usuario_ativo())
    and (usuario_id = (select auth.uid()) or (select autorizacao.pode_administrar_usuarios()))
  )
  with check (
    (select autorizacao.usuario_ativo())
    and (usuario_id = (select auth.uid()) or (select autorizacao.pode_administrar_usuarios()))
  );

drop policy if exists fotos_de_usuario_remover on public.fotos_de_usuario;
create policy fotos_de_usuario_remover on public.fotos_de_usuario
  for delete to authenticated
  using (
    (select autorizacao.usuario_ativo())
    and (usuario_id = (select auth.uid()) or (select autorizacao.pode_administrar_usuarios()))
  );
