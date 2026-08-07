-- ============================================================================
-- VeloxLab — Remoção das coordenadas
--
-- Decisão de produto: o sistema não trabalha mais com latitude/longitude, nem
-- no cadastro do site nem na leitura em campo.
--
-- São duas colunas com o mesmo nome e significados diferentes, e as duas saem:
--
--   `sites.latitude/longitude`  -- onde a unidade fica, cadastrada a mão.
--   `leituras.latitude/longitude` -- onde a coleta foi feita, enviada pelo
--                                    aparelho na importação.
--
-- CONSEQUÊNCIA: o filtro "Com Localização" / "Sem Localização" da tela de
-- Coletas Importadas era literalmente `latitude is not null`. Sem a coluna ele
-- não existe mais, e sai junto -- não há como preservá-lo.
--
-- O índice parcial `leituras_com_localizacao_idx` (0004) existia só para esse
-- filtro. `drop column` já levaria o índice junto; o drop explícito antes é
-- para a intenção ficar legível no diff.
--
-- Sem perda de dado: as duas tabelas estavam vazias quando isto foi escrito
-- (0 sites, 0 leituras), conferido por consulta antes de gerar a migration.
-- Num banco com dado, isto É perda irreversível -- não há coluna de volta.
--
-- A rota de importação continua ACEITANDO `latitude`/`longitude` no corpo do
-- lote e passa a ignorá-los, em vez de recusar. Quem envia os lotes hoje não
-- precisa mudar nada do lado de lá; ver `lib/importar-coletas.ts`.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

drop index if exists public.leituras_com_localizacao_idx;

alter table public.leituras
  drop column if exists latitude,
  drop column if exists longitude;

alter table public.sites
  drop column if exists latitude,
  drop column if exists longitude;

-- ---------------------------------------------------------------------------
-- Permissoes de coluna
--
-- Os grants da 0021 citam `latitude` e `longitude` nome a nome. Postgres remove
-- a coluna do grant junto com a coluna, entao isto nao e estritamente
-- necessario -- esta aqui para a lista continuar legivel como fonte unica de
-- "o que a tela pode gravar", em vez de exigir subtracao mental da 0021.
-- ---------------------------------------------------------------------------
revoke insert, update on public.sites from authenticated;
grant insert (
  grupo_site_id, nome, sigla, regional, cidade, uf, observacao,
  tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas
) on public.sites to authenticated;
grant update (
  grupo_site_id, nome, sigla, regional, cidade, uf, observacao,
  tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas
) on public.sites to authenticated;
