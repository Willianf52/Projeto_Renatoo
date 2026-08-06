-- ============================================================================
-- VeloxLab — Escrita de QR codes
--
-- Repete para `qr_codes` o padrao das migrations 0009 (`grupos_sites`) e 0012
-- (`sites`): grant por coluna + policy apoiada em
-- `pode_administrar_cadastros()`. Nada de novo na regra de autorizacao.
--
-- Motivo de existir agora: a rota de importacao (`/api/importar/coletas`)
-- resolve `checkpoint` pelo codigo do QR e recusa o lote quando ele nao
-- existe. Ate aqui um QR so entrava por SQL ou pelo `seed.sql`, o que fazia
-- do cadastro um pre-requisito sem tela -- a mesma situacao que a 0012
-- resolveu para `sites`.
--
-- DELETE fica de fora, como nas duas anteriores. `leituras.qr_code_id`
-- referencia esta tabela com `on delete set null`: apagar um QR nao trava,
-- mas apaga em silencio de qual checkpoint cada leitura historica veio. A
-- tela usa `ativo` para tirar de circulacao.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Permissoes de coluna ----------------------------------------------------
-- O grant e pre-requisito; o RLS abaixo e o portao de verdade. Sem o grant a
-- policy nunca chega a ser avaliada.
--
-- `criado_em` de fora, mesmo criterio das 0009/0012: nada na aplicacao a
-- edita, e uma chamada direta a API poderia reescrever a data de criacao de um
-- cadastro antigo. `id` e `generated always as identity`.

revoke insert, update on public.qr_codes from authenticated;
grant insert (codigo, site_id, finalidade, ativo) on public.qr_codes to authenticated;
grant update (codigo, site_id, finalidade, ativo) on public.qr_codes to authenticated;

/**
 * A policy de INSERT/UPDATE junta duas condicoes, e a segunda importa tanto
 * quanto a primeira: alem de administrar cadastros, quem escreve precisa
 * enxergar o grupo do site em que o QR vai ficar.
 *
 * Sem o segundo termo, um CLIENTE promovido a OPERACIONAL -- ou qualquer
 * combinacao futura de nivel com escopo -- poderia pendurar um checkpoint num
 * site que nem consegue ler. `pode_ver_grupo_site()` (0014) ja devolve true
 * para todo mundo que nao e CLIENTE, entao na pratica nada muda para os
 * niveis de hoje; o termo esta ali para a regra nao depender de o conjunto
 * "administra cadastro" e o conjunto "tem escopo restrito" continuarem
 * disjuntos por acidente.
 */
drop policy if exists "Criacao de qr codes por quem administra" on public.qr_codes;
create policy "Criacao de qr codes por quem administra" on public.qr_codes
  for insert to authenticated
  with check (
    public.pode_administrar_cadastros()
    and exists (
      select 1 from public.sites s
      where s.id = qr_codes.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
    )
  );

-- `using` e `with check` iguais: sem o `with check`, quem pode editar um QR
-- poderia move-lo para um site que ele proprio nao alcanca.
drop policy if exists "Edicao de qr codes por quem administra" on public.qr_codes;
create policy "Edicao de qr codes por quem administra" on public.qr_codes
  for update to authenticated
  using (
    public.pode_administrar_cadastros()
    and exists (
      select 1 from public.sites s
      where s.id = qr_codes.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
    )
  )
  with check (
    public.pode_administrar_cadastros()
    and exists (
      select 1 from public.sites s
      where s.id = qr_codes.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
    )
  );

-- 2) Indices de busca --------------------------------------------------------
-- A tela tem busca livre em codigo e finalidade, com `ilike '%termo%'` -- que
-- nao usa btree comum (ver o cabecalho da 0011). O unique de `codigo` cobre
-- igualdade, nao o padrao com "%" nas duas pontas.

create index if not exists qr_codes_codigo_trgm_idx
  on public.qr_codes using gin (codigo gin_trgm_ops);
create index if not exists qr_codes_finalidade_trgm_idx
  on public.qr_codes using gin (finalidade gin_trgm_ops);

-- Ordenacao da listagem. `codigo` e unique, entao ja e ordenacao total e nao
-- precisa de desempate -- mesma situacao de `grupos_sites.nome` na 0011, e
-- diferente de `sites.nome` na 0012.
create index if not exists qr_codes_codigo_idx on public.qr_codes (codigo);
