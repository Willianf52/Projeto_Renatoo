-- ============================================================================
-- VeloxLab — Escrita de sites
--
-- Repete para `sites` o padrao que a migration 0009 definiu para
-- `grupos_sites`: grant por coluna + policy apoiada em
-- `pode_administrar_cadastros()`. Nada de novo na regra de autorizacao --
-- quem administra grupo administra site.
--
-- Motivo de existir agora: `sites` e o "Local" que aparece em toda coleta e
-- no filtro `Locais` da tela de Coletas Importadas, e ate aqui so entrava por
-- SQL. A rota de importacao (`/api/importar/coletas`) resolve o site por nome
-- e recusa o lote quando ele nao existe, o que tornava o cadastro manual um
-- pre-requisito sem tela.
--
-- DELETE fica de fora pelo mesmo motivo da 0009: `qr_codes.site_id` referencia
-- esta tabela com `on delete cascade` e `visitas.site_id` com
-- `on delete restrict`. Apagar um site levaria os QR codes junto e travaria
-- se houvesse visita registrada -- a tela usa `ativo` para tirar de
-- circulacao, que e o que o sistema de referencia faz.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Unicidade do nome dentro do grupo ---------------------------------------
-- A 0003 nao declarou restricao nenhuma sobre `sites.nome`. Duas unidades
-- homonimas em grupos diferentes sao cadastro legitimo (por isso a restricao e
-- do par, nao da coluna), mas duas com o mesmo nome no mesmo grupo sao um
-- cadastro duplicado -- e a tela nao teria como distingui-las.
--
-- Guardado num bloco: a restricao falha se o banco ja tiver duplicata, e o
-- erro cru nao diria qual. Nesse caso a migration segue e avisa, para a
-- limpeza ser feita antes de tentar de novo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sites_grupo_nome_unico'
  ) then
    begin
      alter table public.sites
        add constraint sites_grupo_nome_unico unique (grupo_site_id, nome);
    exception when unique_violation then
      raise warning 'sites_grupo_nome_unico nao criada: ha sites com nome repetido no mesmo grupo. Resolva as duplicatas e rode a migration de novo.';
    end;
  end if;
end $$;

-- 2) Autoria do cadastro -----------------------------------------------------
-- `criado_por` fica fora do grant abaixo de proposito: preenchida pelo default,
-- e nao pelo cliente, ela nao pode ser forjada numa chamada direta a API.
-- `auth.uid()` devolve null para service_role, que e o comportamento correto
-- para a rota de importacao -- ninguem "criou" aquele registro pela tela.
alter table public.sites alter column criado_por set default auth.uid();

-- 3) Permissoes de coluna ----------------------------------------------------
-- O grant e pre-requisito; o RLS abaixo e o portao de verdade. Sem o grant a
-- policy nunca chega a ser avaliada.
--
-- `criado_em` e `criado_por` de fora, mesmo criterio da 0009: nada na
-- aplicacao as edita, e uma chamada direta a API poderia reescrever a data e a
-- autoria de um cadastro antigo. `id` e `generated always as identity`, entao
-- nem sendo enviado seria aceito.
revoke insert, update on public.sites from authenticated;
grant insert (
  grupo_site_id, nome, sigla, regional, latitude, longitude,
  cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo
) on public.sites to authenticated;
grant update (
  grupo_site_id, nome, sigla, regional, latitude, longitude,
  cidade, uf, observacao, tipo_servico_id, responsavel_id, ativo
) on public.sites to authenticated;

drop policy if exists "Criacao de sites por quem administra" on public.sites;
create policy "Criacao de sites por quem administra" on public.sites
  for insert to authenticated
  with check (public.pode_administrar_cadastros());

-- `using` e `with check` iguais, como na 0009: sem o `with check`, quem pode
-- editar um site poderia salva-lo num estado que ele proprio nao teria
-- permissao de alcancar.
drop policy if exists "Edicao de sites por quem administra" on public.sites;
create policy "Edicao de sites por quem administra" on public.sites
  for update to authenticated
  using (public.pode_administrar_cadastros())
  with check (public.pode_administrar_cadastros());

-- 4) Indices de busca --------------------------------------------------------
-- A tela de Site / Planta tem busca livre em nome, sigla e cidade, com
-- `ilike '%termo%'` -- que nao usa btree comum (ver o cabecalho da 0011).

create index if not exists sites_nome_trgm_idx
  on public.sites using gin (nome gin_trgm_ops);
create index if not exists sites_sigla_trgm_idx
  on public.sites using gin (sigla gin_trgm_ops);
create index if not exists sites_cidade_trgm_idx
  on public.sites using gin (cidade gin_trgm_ops);

-- Ordenacao da listagem. `nome` sozinho nao e ordenacao total (a unicidade e
-- do par com o grupo), entao o desempate por id entra no indice -- sem ele a
-- paginacao pode repetir uma linha numa pagina e pular outra, como ja
-- documentado em `leituras`.
create index if not exists sites_nome_id_idx on public.sites (nome, id);
