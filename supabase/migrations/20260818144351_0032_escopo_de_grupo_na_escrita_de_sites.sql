-- ============================================================================
-- VeloxLab — Escopo de grupo na escrita de `sites`
--
-- A 0015 conjugou `pode_administrar_cadastros()` com `pode_ver_grupo_site()`
-- nas policies de escrita de `qr_codes`, e o cabecalho de la explica o porque
-- melhor do que este: o termo existe "para a regra nao depender de o conjunto
-- 'administra cadastro' e o conjunto 'tem escopo restrito' continuarem
-- disjuntos por acidente".
--
-- `sites` (0012) ficou so com o primeiro termo. Como `qr_codes` alcanca o
-- grupo justamente atraves de `sites`, a tabela de baixo era a mais estrita
-- das duas -- dava para editar o site, mas nao o QR pendurado nele.
--
-- Sem efeito pratico hoje, e isso e deliberado: `pode_ver_grupo_site()`
-- devolve true para todo mundo que nao e CLIENTE, e `cargo` e um valor so --
-- ninguem e CLIENTE e OPERACIONAL ao mesmo tempo. E hardening de consistencia,
-- nao correcao de falha ativa. Entra porque a assimetria entre duas tabelas da
-- mesma hierarquia e o tipo de detalhe que a proxima pessoa le como descuido e
-- "corrige" no lado errado.
--
-- Nota sobre o UPDATE: num UPDATE o `using` enxerga a linha ANTIGA e o
-- `with check` a NOVA, entao a conjuncao repetida nos dois nao e redundancia
-- -- ela exige alcance sobre o grupo de onde o site sai E sobre o grupo para
-- onde ele vai. Sem o `with check`, quem administra poderia empurrar um site
-- para um grupo que nao enxerga; sem o `using`, poderia puxar um de la.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Aplicada em producao em 2026-08-18, depois do ensaio (o pgTAP
-- `escrita_de_sites_no_escopo_test.sql` rodado na mesma transacao que este SQL,
-- terminando em rollback: 8/8). Smoke test das telas de cadastro contra o banco
-- ja migrado confirmou que criar, editar e mover site entre grupos continua
-- funcionando para OPERACIONAL.
-- ============================================================================

drop policy if exists "Criacao de sites por quem administra" on public.sites;
create policy "Criacao de sites por quem administra" on public.sites
  for insert to authenticated
  with check (
    public.pode_administrar_cadastros()
    and public.pode_ver_grupo_site(grupo_site_id)
  );

drop policy if exists "Edicao de sites por quem administra" on public.sites;
create policy "Edicao de sites por quem administra" on public.sites
  for update to authenticated
  using (
    public.pode_administrar_cadastros()
    and public.pode_ver_grupo_site(grupo_site_id)
  )
  with check (
    public.pode_administrar_cadastros()
    and public.pode_ver_grupo_site(grupo_site_id)
  );
