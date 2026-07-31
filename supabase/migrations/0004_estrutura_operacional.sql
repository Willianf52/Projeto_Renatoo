-- ============================================================================
-- VeloxLab — Estrutura operacional
--
-- Registra as visitas aos sites e as leituras feitas em cada uma.
--
-- Granularidade: uma `visita` corresponde ao numero exibido na coluna
-- "Coleta" e agrupa as `leituras`. Cada leitura e uma passagem do QR code do
-- site, marcada com a area (fase) em que ocorreu -- tipicamente Inicio na
-- chegada e Termino na saida.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Tabelas de apoio --------------------------------------------------------
-- Areas sao globais: Inicio e Termino sao fases da visita, nao pontos fisicos
-- de um site especifico. Por isso nao ha FK para sites.

create table if not exists public.areas (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.motivos_visita (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Eventos, acoes e qualificadores sao campos de excecao: ficam vazios na
-- maioria das leituras e so recebem valor quando algo digno de nota ocorre.

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.acoes (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.qualificadores (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Tipo do equipamento que originou a coleta. Ex: Dispositivo Movel.
create table if not exists public.coletores_dados (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 2) Visitas -----------------------------------------------------------------

create table if not exists public.visitas (
  id bigint generated always as identity primary key,
  -- Numero exibido na coluna "Coleta". Vem do dispositivo, por isso nao e a
  -- chave primaria: garante rastreabilidade com a origem sem acoplar o modelo.
  numero_coleta bigint not null,
  site_id bigint not null references public.sites (id) on delete restrict,
  funcionario_id uuid references public.profiles (id) on delete set null,
  motivo_visita_id bigint references public.motivos_visita (id) on delete set null,
  coletor_dados_id bigint references public.coletores_dados (id) on delete set null,
  -- Momento em que o dispositivo enviou os dados. Difere de quando a leitura
  -- aconteceu: os aparelhos guardam offline e sobem em lote.
  data_integracao timestamptz,
  criado_em timestamptz not null default now(),

  -- Impede que o mesmo lote reenviado gere visitas duplicadas.
  constraint visitas_numero_site_unico unique (numero_coleta, site_id)
);

create index if not exists visitas_site_id_idx on public.visitas (site_id);
create index if not exists visitas_funcionario_id_idx on public.visitas (funcionario_id);
create index if not exists visitas_data_integracao_idx on public.visitas (data_integracao desc);

-- 3) Leituras ----------------------------------------------------------------

create table if not exists public.leituras (
  id bigint generated always as identity primary key,
  visita_id bigint not null references public.visitas (id) on delete cascade,
  area_id bigint references public.areas (id) on delete set null,
  qr_code_id bigint references public.qr_codes (id) on delete set null,

  -- Momento real da leitura, informado pelo dispositivo.
  data_hora timestamptz not null,

  -- Coordenadas capturadas na leitura. Nulas quando o aparelho nao obteve
  -- sinal: e o que alimenta o filtro "Com Localizacao" / "Sem Localizacao".
  latitude numeric(10, 7),
  longitude numeric(10, 7),

  -- Campos de excecao.
  evento_id bigint references public.eventos (id) on delete set null,
  acao_id bigint references public.acoes (id) on delete set null,
  qualificador_id bigint references public.qualificadores (id) on delete set null,
  observacao text,

  data_integracao timestamptz,
  criado_em timestamptz not null default now(),

  -- Uma visita nao registra a mesma area duas vezes no mesmo instante.
  -- Torna a reimportacao de um lote segura.
  constraint leituras_visita_area_hora_unico unique (visita_id, area_id, data_hora)
);

create index if not exists leituras_visita_id_idx on public.leituras (visita_id);
create index if not exists leituras_data_hora_idx on public.leituras (data_hora desc);
create index if not exists leituras_evento_id_idx on public.leituras (evento_id)
  where evento_id is not null;

-- Acelera o filtro por presenca de coordenadas.
create index if not exists leituras_com_localizacao_idx on public.leituras (id)
  where latitude is not null;

-- 4) Metas -------------------------------------------------------------------
-- Quantidade de visitas esperada por site em um mes. Alimenta o grafico
-- "Visitas Realizadas x Nao Realizadas" do historico de supervisao.

create table if not exists public.metas_visitas (
  id bigint generated always as identity primary key,
  site_id bigint not null references public.sites (id) on delete cascade,
  -- Primeiro dia do mes de referencia.
  competencia date not null,
  quantidade_esperada integer not null check (quantidade_esperada >= 0),
  criado_em timestamptz not null default now(),

  constraint metas_site_competencia_unico unique (site_id, competencia)
);

-- 5) Row Level Security ------------------------------------------------------
-- Leitura liberada para autenticados. Escrita sem policy: a importacao dos
-- lotes ocorre no servidor com service_role, nunca a partir do navegador.

alter table public.areas enable row level security;
alter table public.motivos_visita enable row level security;
alter table public.eventos enable row level security;
alter table public.acoes enable row level security;
alter table public.qualificadores enable row level security;
alter table public.coletores_dados enable row level security;
alter table public.visitas enable row level security;
alter table public.leituras enable row level security;
alter table public.metas_visitas enable row level security;

drop policy if exists "Leitura para autenticados" on public.areas;
create policy "Leitura para autenticados" on public.areas
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.motivos_visita;
create policy "Leitura para autenticados" on public.motivos_visita
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.eventos;
create policy "Leitura para autenticados" on public.eventos
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.acoes;
create policy "Leitura para autenticados" on public.acoes
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.qualificadores;
create policy "Leitura para autenticados" on public.qualificadores
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.coletores_dados;
create policy "Leitura para autenticados" on public.coletores_dados
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.visitas;
create policy "Leitura para autenticados" on public.visitas
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.leituras;
create policy "Leitura para autenticados" on public.leituras
  for select to authenticated using (true);

drop policy if exists "Leitura para autenticados" on public.metas_visitas;
create policy "Leitura para autenticados" on public.metas_visitas
  for select to authenticated using (true);

-- 6) Valores iniciais --------------------------------------------------------
-- Registros observados nos dados de referencia.

insert into public.areas (nome) values ('Início'), ('Término')
  on conflict (nome) do nothing;

insert into public.motivos_visita (nome) values ('Inspeção')
  on conflict (nome) do nothing;

insert into public.coletores_dados (nome) values ('Dispositivo Móvel')
  on conflict (nome) do nothing;
