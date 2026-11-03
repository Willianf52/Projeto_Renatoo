-- ============================================================================
-- 0085 -- Cadastro do Cliente (Cadastros > Cliente)
--
-- O "Cliente" do sistema de referencia e o cadastro da conta da empresa:
-- identificacao (nome fantasia, razao social, CNPJ, ramo, logotipo) e as
-- configuracoes da conta. Aqui o portal e de uma empresa so, entao a tabela
-- tem UMA linha (`unica`), como `manutencao.aviso_de_inspecao` (0080).
--
-- Das ~35 configuracoes do antigo, entram as que o portal USA (decisao do
-- dono em 03/11/2026):
--   - `titulo_pdf`: vai na faixa do PDF do checklist (aviso de inspecao);
--   - `nome_fantasia_no_remetente`: o nome fantasia vira o nome do remetente
--     dos e-mails;
--   - `legenda_nas_imagens`: a legenda "Foto" sob as fotos do PDF;
--   - `min_caracteres_descricao` / `min_caracteres_acoes`: o minimo de texto
--     da analise e das acoes realizadas no Painel de Eventos.
-- As de modulos que o portal nao tem (OS, SLA, NPS, Sankhya, cronometro...)
-- ficam de fora.
--
-- Leitura: quem ve toda a operacao. Escrita: quem administra usuarios
-- (GESTOR), como as demais configuracoes da conta.
-- ============================================================================

create table if not exists public.cliente (
  unica boolean primary key default true check (unica),
  nome_fantasia text not null,
  razao_social text,
  cnpj text,
  ramo_atividade text,
  logotipo_path text,
  ativo boolean not null default true,
  titulo_pdf text,
  nome_fantasia_no_remetente boolean not null default false,
  legenda_nas_imagens boolean not null default true,
  min_caracteres_descricao integer not null default 0,
  min_caracteres_acoes integer not null default 0,
  criado_em timestamptz not null default now(),
  constraint cliente_nome_fantasia_check check (length(btrim(nome_fantasia)) between 1 and 100),
  constraint cliente_razao_social_check check (razao_social is null or length(razao_social) <= 200),
  constraint cliente_cnpj_check check (cnpj is null or cnpj ~ '^\d{14}$'),
  constraint cliente_ramo_check check (ramo_atividade is null or length(ramo_atividade) <= 100),
  constraint cliente_titulo_pdf_check check (titulo_pdf is null or length(titulo_pdf) <= 80),
  constraint cliente_min_descricao_check check (min_caracteres_descricao between 0 and 1000),
  constraint cliente_min_acoes_check check (min_caracteres_acoes between 0 and 1000)
);

comment on table public.cliente is
  'O cadastro da conta da empresa ("Cliente" do sistema de referencia): uma linha so. Ver 0085.';

insert into public.cliente (nome_fantasia) values ('Up Serviços') on conflict (unica) do nothing;

alter table public.cliente enable row level security;

revoke all on public.cliente from anon, authenticated;
grant select on public.cliente to authenticated;
grant update (nome_fantasia, razao_social, cnpj, ramo_atividade, logotipo_path, ativo, titulo_pdf,
              nome_fantasia_no_remetente, legenda_nas_imagens, min_caracteres_descricao, min_caracteres_acoes)
  on public.cliente to authenticated;
grant all on public.cliente to service_role;

drop policy if exists "Gestao le o cliente" on public.cliente;
create policy "Gestao le o cliente" on public.cliente
  for select to authenticated using ((select autorizacao.pode_ver_toda_operacao()));

drop policy if exists "Gestor edita o cliente" on public.cliente;
create policy "Gestor edita o cliente" on public.cliente
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

-- Logotipo -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cliente', 'cliente', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Gestao le o logotipo" on storage.objects;
create policy "Gestao le o logotipo" on storage.objects
  for select to authenticated
  using (bucket_id = 'cliente' and (select autorizacao.pode_ver_toda_operacao()));

drop policy if exists "Gestor envia o logotipo" on storage.objects;
create policy "Gestor envia o logotipo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cliente' and (select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor troca o logotipo" on storage.objects;
create policy "Gestor troca o logotipo" on storage.objects
  for update to authenticated
  using (bucket_id = 'cliente' and (select autorizacao.pode_administrar_usuarios()))
  with check (bucket_id = 'cliente' and (select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor apaga o logotipo" on storage.objects;
create policy "Gestor apaga o logotipo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cliente' and (select autorizacao.pode_administrar_usuarios()));
