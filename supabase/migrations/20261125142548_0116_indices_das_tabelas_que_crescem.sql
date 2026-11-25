-- ============================================================================
-- 0116: indices nas chaves estrangeiras das tabelas que crescem com o uso
--
-- O advisor de desempenho do Supabase aponta 32 chaves estrangeiras sem indice
-- (25/11/2026). Aqui entram so as 15 das tabelas que crescem a cada inspecao,
-- ocorrencia ou registro de km: com o teste dos inspetores elas comecam a
-- encher, e sem indice cada busca pela chave (ou cada exclusao/alteracao da
-- linha referenciada, como desativar ou apagar um perfil) varre a tabela
-- inteira. As outras 17 sao de cadastros pequenos (agendas, eventos, perfis,
-- sites, perguntas) e ficam como estao.
--
-- So `create index if not exists`: nao muda dado, regra nem permissao. Sem
-- CONCURRENTLY porque a migration roda numa transacao, e as tabelas estao
-- quase vazias (o teste foi zerado em 23/11), entao o bloqueio e instantaneo.
-- ============================================================================

create index if not exists checklists_visita_aprovacao_por_fk_idx on public.checklists_visita (aprovacao_por);
create index if not exists ocorrencias_aberta_por_fk_idx on public.ocorrencias (aberta_por);
create index if not exists ocorrencias_classificacao_fk_idx on public.ocorrencias (classificacao_id);
create index if not exists ocorrencias_pergunta_fk_idx on public.ocorrencias (pergunta_id);
create index if not exists ocorrencias_subevento_fk_idx on public.ocorrencias (subevento_id);
create index if not exists ocorrencia_andamentos_autor_fk_idx on public.ocorrencia_andamentos (autor_id);
create index if not exists ocorrencia_andamentos_classificacao_fk_idx on public.ocorrencia_andamentos (classificacao_id);
create index if not exists ocorrencia_andamentos_grupo_usuario_fk_idx on public.ocorrencia_andamentos (grupo_usuario_id);
create index if not exists ocorrencia_andamentos_responsavel_fk_idx on public.ocorrencia_andamentos (responsavel_id);
create index if not exists ocorrencia_andamentos_tipo_analise_fk_idx on public.ocorrencia_andamentos (tipo_analise_id);
create index if not exists ocorrencia_emails_andamento_fk_idx on public.ocorrencia_emails (andamento_id);
create index if not exists ocorrencia_emails_enviado_por_fk_idx on public.ocorrencia_emails (enviado_por);
create index if not exists veiculo_km_registrado_por_fk_idx on public.veiculo_km (registrado_por);
create index if not exists veiculo_manutencoes_registrado_por_fk_idx on public.veiculo_manutencoes (registrado_por);
create index if not exists maquina_manutencoes_registrado_por_fk_idx on public.maquina_manutencoes (registrado_por);
