-- ============================================================================
-- VeloxLab — Endereço, hierarquia e códigos do site
--
-- O cadastro de Site / Planta guardava a unidade quase sem endereço: cidade,
-- UF e coordenadas. O sistema de referência pede o endereço inteiro, os
-- códigos de integração e a posição do site dentro de uma árvore de sites.
--
-- Três grupos de colunas, com motivos diferentes:
--
-- 1) `site_superior_id` -- auto-referência. Hoje a coluna "Hierarquia" da
--    listagem mostra organização > grupo > site, e o nível do meio vem de
--    `grupos_sites`. Com isto, um site pode pendurar em outro (uma agência
--    dentro de um complexo), e a cadeia passa a ter a profundidade real.
--    `on delete set null`: apagar o pai não pode apagar o filho junto.
--
-- 2) Endereço -- `numero` é texto, e não inteiro: "123-A", "s/n" e "km 12" são
--    números de porta legítimos e nenhum deles cabe num integer.
--
-- 3) Códigos e flags -- `cod_cliente`, `cod_posto` e `filial` são as chaves
--    pelas quais o cliente identifica a mesma unidade nos sistemas dele; ficam
--    text porque não são nossas e não temos como impor formato.
--
-- Os defaults dos três booleanos seguem a referência: um site novo recebe
-- visita e gera QR-Code automaticamente, e NÃO gera registro em coletas
-- importadas -- este último cria dado, então o padrão seguro é não criar.
--
-- Nenhuma coluna é `not null` sem default: a tabela já tem linhas em produção,
-- e uma coluna obrigatória sem default faria a migration falhar.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

alter table public.sites
  add column if not exists site_superior_id bigint references public.sites (id) on delete set null,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists complemento text,
  add column if not exists pais text not null default 'Brasil',
  add column if not exists raio_metros integer,
  add column if not exists cod_cliente text,
  add column if not exists cod_posto text,
  add column if not exists filial text,
  add column if not exists info_adicional_1 text,
  add column if not exists info_adicional_2 text,
  add column if not exists recebe_visita boolean not null default true,
  add column if not exists gerar_qrcode_automatico boolean not null default true,
  add column if not exists gerar_registro_coletas boolean not null default false;

comment on column public.sites.site_superior_id is
  'Site pai na arvore de sites. Nulo = raiz, que e o caso comum.';
comment on column public.sites.numero is
  'Texto, nao inteiro: "123-A", "s/n" e "km 12" sao numeros de porta validos.';
comment on column public.sites.raio_metros is
  'Raio de tolerancia da coleta em metros. Nulo = sem raio definido.';

-- Um site nao pode ser o proprio pai. Ciclos mais longos (A > B > A) nao dao
-- para impedir com check constraint -- exigiriam trigger recursivo -- mas o
-- caso de um clique errado no select e este, e ele fica barrado no banco e nao
-- so na tela.
alter table public.sites drop constraint if exists sites_superior_nao_e_si_mesmo;
alter table public.sites
  add constraint sites_superior_nao_e_si_mesmo check (site_superior_id is distinct from id);

-- Buscar os filhos de um site percorreria a tabela inteira sem isto, e a tela
-- de edicao precisa saber se o site tem filhos antes de deixar mudar o pai.
create index if not exists sites_superior_idx on public.sites (site_superior_id);

-- ---------------------------------------------------------------------------
-- Permissoes de coluna
--
-- Os grants da 0012 listam coluna por coluna, entao coluna nova nasce sem
-- permissao de escrita -- o formulario gravaria os campos antigos e ignoraria
-- os novos em silencio. Refeitos aqui com a lista completa.
--
-- `criado_em` e `criado_por` seguem de fora, mesmo criterio da 0012: nada na
-- aplicacao as edita, e uma chamada direta a API poderia reescrever a autoria
-- de um cadastro antigo.
-- ---------------------------------------------------------------------------
revoke insert, update on public.sites from authenticated;
grant insert (
  grupo_site_id, nome, sigla, regional, latitude, longitude,
  cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas
) on public.sites to authenticated;
grant update (
  grupo_site_id, nome, sigla, regional, latitude, longitude,
  cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo,
  site_superior_id, cep, endereco, numero, bairro, complemento, pais,
  raio_metros, cod_cliente, cod_posto, filial, info_adicional_1,
  info_adicional_2, recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas
) on public.sites to authenticated;
