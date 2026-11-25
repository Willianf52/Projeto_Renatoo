-- ============================================================================
-- pgTAP -- 0116: as chaves estrangeiras das tabelas que crescem tem indice.
-- ============================================================================

begin;

select plan(15);

select has_index('public', 'checklists_visita', 'checklists_visita_aprovacao_por_fk_idx', array['aprovacao_por'], 'indice em checklists_visita.aprovacao_por');
select has_index('public', 'ocorrencias', 'ocorrencias_aberta_por_fk_idx', array['aberta_por'], 'indice em ocorrencias.aberta_por');
select has_index('public', 'ocorrencias', 'ocorrencias_classificacao_fk_idx', array['classificacao_id'], 'indice em ocorrencias.classificacao_id');
select has_index('public', 'ocorrencias', 'ocorrencias_pergunta_fk_idx', array['pergunta_id'], 'indice em ocorrencias.pergunta_id');
select has_index('public', 'ocorrencias', 'ocorrencias_subevento_fk_idx', array['subevento_id'], 'indice em ocorrencias.subevento_id');
select has_index('public', 'ocorrencia_andamentos', 'ocorrencia_andamentos_autor_fk_idx', array['autor_id'], 'indice em ocorrencia_andamentos.autor_id');
select has_index('public', 'ocorrencia_andamentos', 'ocorrencia_andamentos_classificacao_fk_idx', array['classificacao_id'], 'indice em ocorrencia_andamentos.classificacao_id');
select has_index('public', 'ocorrencia_andamentos', 'ocorrencia_andamentos_grupo_usuario_fk_idx', array['grupo_usuario_id'], 'indice em ocorrencia_andamentos.grupo_usuario_id');
select has_index('public', 'ocorrencia_andamentos', 'ocorrencia_andamentos_responsavel_fk_idx', array['responsavel_id'], 'indice em ocorrencia_andamentos.responsavel_id');
select has_index('public', 'ocorrencia_andamentos', 'ocorrencia_andamentos_tipo_analise_fk_idx', array['tipo_analise_id'], 'indice em ocorrencia_andamentos.tipo_analise_id');
select has_index('public', 'ocorrencia_emails', 'ocorrencia_emails_andamento_fk_idx', array['andamento_id'], 'indice em ocorrencia_emails.andamento_id');
select has_index('public', 'ocorrencia_emails', 'ocorrencia_emails_enviado_por_fk_idx', array['enviado_por'], 'indice em ocorrencia_emails.enviado_por');
select has_index('public', 'veiculo_km', 'veiculo_km_registrado_por_fk_idx', array['registrado_por'], 'indice em veiculo_km.registrado_por');
select has_index('public', 'veiculo_manutencoes', 'veiculo_manutencoes_registrado_por_fk_idx', array['registrado_por'], 'indice em veiculo_manutencoes.registrado_por');
select has_index('public', 'maquina_manutencoes', 'maquina_manutencoes_registrado_por_fk_idx', array['registrado_por'], 'indice em maquina_manutencoes.registrado_por');

select * from finish();
rollback;
