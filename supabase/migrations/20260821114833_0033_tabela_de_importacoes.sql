-- ============================================================================
-- VeloxLab — Tabela de importações
--
-- Registra cada tentativa de lote recebida por `POST /api/importar/coletas`,
-- sucesso ou recusa. Ate aqui, quando um lote era recusado -- 400 por
-- formato, 422 por referencia desconhecida, 502 por falha de banco -- a
-- resposta voltava para quem chamou e o evento morria ali: os `erro()` da
-- rota vao para o log do servidor e para o Sentry, que ninguem opera como
-- fila de reprocessamento, e um 422 e resposta tratada, nao excecao, entao
-- nem chega la. Ver o item "Nada registra que um lote de importacao foi
-- recebido" em docs/melhorias.md.
--
-- Uma linha por TENTATIVA, nao por lote bem-sucedido -- e a lista de recusas
-- que transforma "sumiu" em "falhou as 03:12, motivo Y, reenviar". Nao cobre
-- 401 (segredo incorreto) nem 429 (limite de taxa): esses dois acontecem
-- antes de confiar em quem chamou, e nao sao lote nenhum -- sao a rota
-- rejeitando quem nao provou ser a integracao. Registrar essas duas linha por
-- linha transformaria a tabela num alvo de ruido para quem varre a rota sem o
-- segredo.
--
-- RLS: leitura para autenticados, mesmo padrao de `visitas`/`leituras`
-- (migration 0004) -- sem policy de escrita, porque quem grava e a propria
-- rota de importacao com service_role, que ignora RLS. `authenticated` nao
-- ganha grant de escrita nem por default privilege: a migration 0031 fechou a
-- fonte (`alter default privileges ... revoke insert, update, delete,
-- truncate on tables from anon, authenticated`) antes desta tabela existir,
-- entao ela ja nasce sem o grant -- o revoke abaixo e so defesa em
-- profundidade, documentando a intencao no arquivo desta tabela em vez de
-- depender de quem le so este arquivo saber da 0031.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
--
-- Aplicada em producao em 2026-08-21, depois do ensaio (o pgTAP
-- `importacoes_test.sql` rodado na mesma transacao que este SQL, terminando
-- em rollback: 3/3 asserts passaram, nada persistiu). Advisor `security`
-- depois: nenhum achado novo relacionado a esta tabela.
-- ============================================================================

create table if not exists public.importacoes (
  id bigint generated always as identity primary key,

  -- Id curto de `lib/log.ts`, para cruzar esta linha com o `erro()` que a
  -- mesma requisicao gerou no log/Sentry.
  id_requisicao text not null,

  -- IP de quem chamou (`identificarChamador`, `lib/rate-limit.ts`). Texto
  -- livre e nao `inet`: o valor pode ser "sem-ip" quando a requisicao nao
  -- passa por proxy confiavel.
  origem text not null,

  status text not null check (status in (
    'sucesso',
    'corpo_invalido',
    'lote_invalido',
    'referencia_desconhecida',
    'falha_ao_consultar_referencias',
    'falha_ao_gravar_visitas',
    'falha_ao_gravar_leituras'
  )),
  http_status smallint not null,

  linhas_recebidas integer not null default 0,
  visitas_gravadas integer not null default 0,
  leituras_novas integer not null default 0,

  -- Resumo legivel do que deu errado. Nulo em sucesso.
  mensagem text,
  -- Detalhe estruturado -- hoje so preenchido em `referencia_desconhecida`,
  -- com a mesma lista de problemas (capada em 20 linhas) que a resposta HTTP
  -- devolve para quem chamou.
  detalhe jsonb,

  criado_em timestamptz not null default now()
);

comment on table public.importacoes is
  'Uma linha por tentativa de lote recebida pela rota de importacao -- sucesso ou recusa.';

create index if not exists importacoes_criado_em_idx on public.importacoes (criado_em desc);
create index if not exists importacoes_status_idx on public.importacoes (status);

alter table public.importacoes enable row level security;

drop policy if exists "Leitura para autenticados" on public.importacoes;
create policy "Leitura para autenticados" on public.importacoes
  for select to authenticated using (true);

-- Ver o comentario do cabecalho: redundante com a 0031, mantido por clareza
-- de quem le so este arquivo.
revoke insert, update, delete, truncate on public.importacoes from anon, authenticated;
