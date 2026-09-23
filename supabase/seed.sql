-- ============================================================================
-- Dados de semente
--
-- Roda automaticamente no `supabase db reset` (local). Cobre tres coisas que
-- as migrations deixam em aberto:
--
--   1) As tabelas de referencia que alimentam os selects de filtro da tela de
--      Coletas Importadas. A 0004 semeia so `areas`, `motivos_visita` e
--      `coletores_dados`; `eventos`, `acoes`, `qualificadores` e
--      `tipos_servico` nascem vazias, e select de filtro vazio parece defeito
--      de tela, nao tabela sem cadastro.
--
--   2) Um grupo de sites com unidades e QR codes, para a rota de importacao
--      (`POST /api/importar/coletas`) ter em que se apoiar: ela resolve site,
--      area e checkpoint por nome e recusa o lote quando o nome nao existe.
--
--   3) As extensoes `supabase_vault` e `pg_net`, que producao tem e as
--      migrations de proposito nao criam (a 0053 as verifica em tempo de
--      execucao). Ver a secao 4 -- e o unico item daqui de que um teste pgTAP
--      depende.
--
-- Nao semeia `visitas` nem `leituras`: dado operacional entra pela rota de
-- importacao, que e o caminho que precisa ser exercitado. Semear aqui
-- mascararia uma importacao quebrada com uma tela cheia.
--
-- Nao semeia usuario nenhum: `profiles.id` referencia `auth.users`, e criar
-- usuario de autenticacao por SQL depende de detalhes internos do GoTrue que
-- mudam entre versoes. Use o painel ou o fluxo de cadastro do proprio app.
--
-- Os testes pgTAP (supabase/tests/database) nao dependem dos DADOS daqui: cada
-- um cria os proprios usuarios e perfis dentro de uma transacao com rollback.
-- Dependem, sim, das extensoes da secao 4.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.
-- ============================================================================

-- 1) Tabelas de referencia ---------------------------------------------------

insert into public.tipos_servico (nome) values
  ('Portaria'),
  ('Limpeza'),
  ('Ronda'),
  ('Manutenção')
on conflict (nome) do nothing;

-- Campos de excecao: ficam vazios na maioria das leituras e so recebem valor
-- quando algo digno de nota ocorre (ver o comentario da migration 0004).
insert into public.eventos (nome) values
  ('Ausência de posto'),
  ('Equipamento danificado'),
  ('Acesso irregular'),
  ('Área obstruída')
on conflict (nome) do nothing;

insert into public.acoes (nome) values
  ('Registrado em relatório'),
  ('Comunicado ao supervisor'),
  ('Acionada manutenção'),
  ('Resolvido no local')
on conflict (nome) do nothing;

insert into public.qualificadores (nome) values
  ('Conforme'),
  ('Não conforme'),
  ('Pendente de verificação')
on conflict (nome) do nothing;

-- Complementam o que a 0004 ja inseriu.
insert into public.motivos_visita (nome) values
  ('Ronda programada'),
  ('Atendimento a chamado'),
  ('Auditoria')
on conflict (nome) do nothing;

insert into public.coletores_dados (nome) values
  ('Aplicativo Web'),
  ('Importação em lote')
on conflict (nome) do nothing;

-- 2) Hierarquia de sites -----------------------------------------------------

insert into public.grupos_sites (nome, descricao) values
  ('Cooperativa de Crédito Cooplivre', 'Agências e postos de atendimento da Cooplivre.'),
  ('Rede Bom Preço', 'Lojas e centros de distribuição.')
on conflict (nome) do nothing;

-- Os ids sao `generated always as identity`: nao da pra cravar o valor, entao
-- as FKs sao resolvidas por subconsulta no nome.
--
-- `not exists` em vez de `on conflict`: `sites.nome` nao e unique (so o par
-- com o grupo faria sentido, e a 0003 nao declarou nem esse), entao nao ha
-- constraint em que o `on conflict` pudesse se apoiar.
insert into public.sites (grupo_site_id, nome, sigla, regional, cidade, uf, tipo_servico_id)
select g.id, v.nome, v.sigla, v.regional, v.cidade, v.uf, t.id
from (values
  ('Cooperativa de Crédito Cooplivre', 'Agência Centro',         'AGC', 'Sul',     'Porto Alegre', 'RS', 'Portaria'),
  ('Cooperativa de Crédito Cooplivre', 'Agência Zona Norte',     'AZN', 'Sul',     'Porto Alegre', 'RS', 'Portaria'),
  ('Cooperativa de Crédito Cooplivre', 'Posto Universitário',    'PUN', 'Sul',     'Canoas',       'RS', 'Ronda'),
  ('Rede Bom Preço',                   'Loja Ipiranga',          'LIP', 'Sudeste', 'São Paulo',    'SP', 'Limpeza'),
  ('Rede Bom Preço',                   'Centro de Distribuição', 'CDI', 'Sudeste', 'Guarulhos',    'SP', 'Manutenção')
) as v(grupo, nome, sigla, regional, cidade, uf, tipo_servico)
join public.grupos_sites g on g.nome = v.grupo
join public.tipos_servico t on t.nome = v.tipo_servico
where not exists (
  select 1 from public.sites s where s.nome = v.nome and s.grupo_site_id = g.id
);

-- 3) QR codes ----------------------------------------------------------------
-- Um QR identifica o site inteiro: e lido na chegada e na saida da visita
-- (migration 0003). Por isso um por site, e nao um por ponto.

insert into public.qr_codes (codigo, site_id, finalidade)
select v.codigo, s.id, 'Entrada principal'
from (values
  ('QR-AGC-001', 'Agência Centro'),
  ('QR-AZN-001', 'Agência Zona Norte'),
  ('QR-PUN-001', 'Posto Universitário'),
  ('QR-LIP-001', 'Loja Ipiranga'),
  ('QR-CDI-001', 'Centro de Distribuição')
) as v(codigo, site)
join public.sites s on s.nome = v.site
on conflict (codigo) do nothing;

-- 4) Extensoes que o aviso de troca de senha usa -----------------------------
-- A 0053 verifica Vault e pg_net em tempo de execucao e, sem eles, so emite
-- `warning` e deixa a troca de senha seguir (um aviso perdido e ruim; uma
-- pessoa que nao consegue trocar a senha e pior). O efeito colateral disso na
-- CI era um ponto cego: os tres asserts de `aviso_de_troca_de_senha_test.sql`
-- que provam o comportamento -- um pedido por troca, nenhum hash no corpo e o
-- aviso ao endereco ANTIGO num sequestro de conta -- viravam SKIP, e SKIP
-- conta como passe. O check ficava verde sem ter exercitado nada.
--
-- Producao ja tem as duas (`supabase_vault` 0.3.1 em `vault`, `pg_net` 0.20.4
-- em `extensions`, conferido em 23/09/2026), entao ligar aqui aproxima o stack
-- local de producao em vez de inventar um ambiente. Fica no seed, e nao numa
-- migration, exatamente porque nao ha nada a aplicar em producao.
--
-- `pg_net` guarda os objetos no schema `net` que ele mesmo cria; o schema da
-- extensao (`extensions`) e so onde ela se declara -- e como esta em producao.
--
-- Nenhum dos dois entra em `database.types.ts`: `types:generate` roda com
-- `--schema public`.
create extension if not exists supabase_vault;
create extension if not exists pg_net with schema extensions;
