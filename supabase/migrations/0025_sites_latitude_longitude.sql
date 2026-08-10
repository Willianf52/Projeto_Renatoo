-- ============================================================================
-- VeloxLab — Coordenadas do site voltam ao cadastro
--
-- A migration 0022 removeu `sites.latitude/longitude` como decisao de produto
-- ("o sistema nao trabalha mais com coordenadas"). Essa decisao foi revista: o
-- formulario de Site / Planta do sistema de referencia tem os dois campos, com
-- um botao "GPS" para capturar a posicao do navegador na hora do cadastro, e
-- ficaram de volta.
--
-- Importante: isto e so sobre `sites` -- onde a UNIDADE fica, cadastrada a mao
-- ou via GPS. Nao mexe em `leituras.latitude/longitude` (onde a COLETA
-- aconteceu), que a 0022 tambem removeu e a 0023 substituiu por
-- `tem_localizacao`. Sao conceitos diferentes, e o segundo nao voltou a ser
-- pedido.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

alter table public.sites
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

comment on column public.sites.latitude is
  'Coordenada do site. Preenchida a mao ou pelo botao GPS do formulario; nula quando nao informada.';
comment on column public.sites.longitude is
  'Ver latitude.';

-- ---------------------------------------------------------------------------
-- Permissoes de coluna
--
-- Os grants da 0021 listam coluna por coluna, entao a coluna nova nasce sem
-- permissao de escrita -- refeitos aqui com a lista completa.
-- ---------------------------------------------------------------------------
revoke insert, update on public.sites from authenticated;
grant insert (
  grupo_site_id, nome, sigla, regional, cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas,
  latitude, longitude
) on public.sites to authenticated;
grant update (
  grupo_site_id, nome, sigla, regional, cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas,
  latitude, longitude
) on public.sites to authenticated;
