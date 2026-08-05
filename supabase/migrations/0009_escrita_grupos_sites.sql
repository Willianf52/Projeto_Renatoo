-- ============================================================================
-- VeloxLab — Escrita de grupos de sites
--
-- Ate aqui nenhuma tabela de cadastro tinha policy de escrita: a migration
-- 0003 registra a decisao de manter INSERT/UPDATE negados via API, acontecendo
-- so pelo painel, por SQL ou com service_role. Este e o primeiro cadastro a
-- ganhar escrita pela aplicacao, e o padrao definido aqui e o que os demais
-- devem repetir.
--
-- Quem pode administrar: GESTOR, SUPERVISOR e OPERACIONAL. Note que essa
-- regua e mais larga que a de `pode_ver_toda_operacao()` (so GESTOR e
-- SUPERVISOR), por isso um helper proprio em vez de reaproveitar aquele --
-- juntar os dois faria a lista de quem enxerga a operacao inteira crescer de
-- carona com a de quem edita cadastro, que e outra decisao.
--
-- DELETE fica de fora de proposito. `sites.grupo_site_id` referencia esta
-- tabela com `on delete restrict`, e a tela usa `ativo` para tirar um grupo de
-- circulacao. Apagar exigiria decidir o que fazer com os sites pendurados --
-- decisao que ninguem tomou ainda.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create or replace function public.pode_administrar_cadastros()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_ativo()
    and public.nivel_acesso_atual() in ('GESTOR', 'SUPERVISOR', 'OPERACIONAL');
$$;

comment on function public.pode_administrar_cadastros() is
  'Quem pode criar e editar cadastros. Mais amplo que pode_ver_toda_operacao(),
   que decide quem enxerga a operacao inteira -- sao permissoes distintas.';

revoke all on function public.pode_administrar_cadastros() from public;
grant execute on function public.pode_administrar_cadastros() to authenticated;

-- O grant e pre-requisito; o RLS abaixo e o portao de verdade. Sem o grant a
-- policy nunca chega a ser avaliada.
--
-- Por coluna, seguindo o criterio ja usado em `profiles` (migrations 0002 e
-- 0003): `criado_em` fica de fora porque nada na aplicacao a edita, e uma
-- chamada direta a API poderia reescrever a data de criacao de um cadastro
-- antigo. `id` e `generated always as identity`, entao nem sendo enviado seria
-- aceito.
revoke insert, update on public.grupos_sites from authenticated;
grant insert (nome, descricao, ativo) on public.grupos_sites to authenticated;
grant update (nome, descricao, ativo) on public.grupos_sites to authenticated;

drop policy if exists "Criacao de grupos por quem administra" on public.grupos_sites;
create policy "Criacao de grupos por quem administra" on public.grupos_sites
  for insert to authenticated
  with check (public.pode_administrar_cadastros());

-- `using` e `with check` iguais: sem o `with check`, quem pode editar um grupo
-- poderia salvar a linha num estado que ele proprio nao teria permissao de
-- alcancar.
drop policy if exists "Edicao de grupos por quem administra" on public.grupos_sites;
create policy "Edicao de grupos por quem administra" on public.grupos_sites
  for update to authenticated
  using (public.pode_administrar_cadastros())
  with check (public.pode_administrar_cadastros());
