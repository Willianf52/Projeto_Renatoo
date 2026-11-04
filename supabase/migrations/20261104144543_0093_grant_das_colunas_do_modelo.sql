-- ============================================================================
-- 0093: o painel pode gravar as colunas novas do modelo de checklist
--
-- As 0091 (foto_obrigatoria) e 0092 (quantidade_de_assinaturas) criaram as
-- colunas, mas `modelos_checklist` tem permissao de escrita POR COLUNA (0061 deu
-- insert/update so de nome e ativo; a 0089 acrescentou exige_aprovacao). Sem
-- este grant, salvar um modelo no painel falha com "permission denied for
-- column". Mesmo padrao da 0089.
-- ============================================================================

grant insert (foto_obrigatoria, quantidade_de_assinaturas),
      update (foto_obrigatoria, quantidade_de_assinaturas)
  on public.modelos_checklist to authenticated;
