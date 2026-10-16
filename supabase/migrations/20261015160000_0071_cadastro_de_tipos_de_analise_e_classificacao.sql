-- ============================================================================
-- 0071 — Cadastro de Tipos de Analise e Tipos de Classificacao
--
-- Issue #209 (levantamento de 15/10/2026 com uma conta GESTOR no sistema de
-- referencia). La, o menu Eventos do GESTOR tem "Tipos de Analise" e "Tipos de
-- Classificacao": cadastro de Nome, Cor e Status, usados no "Adicionar
-- Analise" do Painel de Eventos. A 0064 criou as duas tabelas (com o tipo
-- padrao de cada uma) so com leitura; nao havia como cadastrar outro.
--
--   1) `cor`: a referencia mostra uma cor por tipo (etiqueta no painel). Hex
--      de 6 digitos, opcional -- os tipos que ja existem ficam sem cor.
--   2) Escrita so do GESTOR, a mesma regua de `pode_administrar_usuarios()`
--      (usuario ativo com cargo GESTOR): na referencia, estes menus nao
--      aparecem para o SUPERVISOR. A leitura continua a da 0064
--      (`pode_ver_toda_operacao()`, GESTOR e SUPERVISOR), porque quem analisa
--      a ocorrencia precisa escolher o tipo.
--   3) Sem DELETE: desativa por `ativo`, como os demais cadastros -- um tipo ja
--      usado num andamento nao pode sumir do historico.
--   4) Trilha na `auditoria` (0034/0070): quem criou, renomeou ou desativou.
--
-- Idempotente.
-- ============================================================================

alter table public.tipos_de_analise
  add column if not exists cor text;
alter table public.tipos_de_classificacao
  add column if not exists cor text;

alter table public.tipos_de_analise
  drop constraint if exists tipos_de_analise_cor_check;
alter table public.tipos_de_analise
  add constraint tipos_de_analise_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');
alter table public.tipos_de_classificacao
  drop constraint if exists tipos_de_classificacao_cor_check;
alter table public.tipos_de_classificacao
  add constraint tipos_de_classificacao_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');

-- Grants por coluna: `id`/`criado_em` nunca vem do cliente.
grant insert (nome, cor, ativo), update (nome, cor, ativo) on public.tipos_de_analise to authenticated;
grant insert (nome, cor, ativo), update (nome, cor, ativo) on public.tipos_de_classificacao to authenticated;

drop policy if exists "Gestor cadastra tipo de analise" on public.tipos_de_analise;
create policy "Gestor cadastra tipo de analise" on public.tipos_de_analise
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita tipo de analise" on public.tipos_de_analise;
create policy "Gestor edita tipo de analise" on public.tipos_de_analise
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor cadastra tipo de classificacao" on public.tipos_de_classificacao;
create policy "Gestor cadastra tipo de classificacao" on public.tipos_de_classificacao
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita tipo de classificacao" on public.tipos_de_classificacao;
create policy "Gestor edita tipo de classificacao" on public.tipos_de_classificacao
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

drop trigger if exists auditoria_trigger on public.tipos_de_analise;
create trigger auditoria_trigger
  after insert or update or delete on public.tipos_de_analise
  for each row execute function public.registrar_auditoria();

drop trigger if exists auditoria_trigger on public.tipos_de_classificacao;
create trigger auditoria_trigger
  after insert or update or delete on public.tipos_de_classificacao
  for each row execute function public.registrar_auditoria();
