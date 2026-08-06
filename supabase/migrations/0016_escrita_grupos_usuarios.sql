-- ============================================================================
-- VeloxLab — Escrita de grupos de usuários
--
-- Ultimo cadastro do menu sem tela. As tabelas existem desde a 0003 e o filtro
-- da tela de Usuarios ja consulta `grupos_usuarios`, mas nada nunca escreveu
-- nelas.
--
-- A regra de quem administra NAO e a das 0009/0012/0015, e a diferenca merece
-- explicacao porque a primeira leitura sugere que deveria ser.
--
-- `pode_administrar_cadastros()` inclui OPERACIONAL. Mas o conteudo deste
-- cadastro e a lista de pessoas: montar um grupo exige ler `profiles`, e a
-- policy da 0006 devolve a operacao inteira apenas para quem
-- `pode_ver_toda_operacao()` -- um OPERACIONAL le so a propria linha. Com
-- apenas o primeiro predicado, um OPERACIONAL poderia criar um grupo e nao
-- conseguiria ver um unico membro para colocar dentro: escrita autorizada
-- sobre dado que ele nao alcanca.
--
-- Daí a conjuncao. Ela colapsa hoje em GESTOR + SUPERVISOR, e escrever
-- `pode_ver_toda_operacao()` sozinho daria o mesmo resultado -- mas amarraria
-- "quem enxerga a operacao" a "quem edita cadastro", que e exatamente o
-- acoplamento que a 0009 evitou. Escrita como conjuncao, a regra continua
-- correta se qualquer uma das duas listas mudar.
--
-- DELETE fica de fora, como nas anteriores: a tela remove membro (linha de
-- `grupos_usuarios_membros`, que tem policy propria abaixo), nao grupo.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

create or replace function public.pode_administrar_grupos_usuarios()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.pode_administrar_cadastros()
    and public.pode_ver_toda_operacao();
$$;

comment on function public.pode_administrar_grupos_usuarios() is
  'Quem pode montar grupos de usuarios. Conjuncao de administrar cadastro com
   enxergar a operacao inteira: o conteudo do cadastro e a lista de pessoas, e
   sem o segundo predicado seria possivel criar um grupo sem conseguir ver
   ninguem para colocar nele.';

revoke all on function public.pode_administrar_grupos_usuarios() from public;
grant execute on function public.pode_administrar_grupos_usuarios() to authenticated;

-- 1) Grupos ------------------------------------------------------------------
-- `criado_em` de fora do grant, mesmo criterio das migrations anteriores.

revoke insert, update on public.grupos_usuarios from authenticated;
grant insert (nome, descricao) on public.grupos_usuarios to authenticated;
grant update (nome, descricao) on public.grupos_usuarios to authenticated;

drop policy if exists "Criacao de grupos de usuarios" on public.grupos_usuarios;
create policy "Criacao de grupos de usuarios" on public.grupos_usuarios
  for insert to authenticated
  with check (public.pode_administrar_grupos_usuarios());

-- `using` e `with check` iguais, como nas demais: sem o `with check`, quem
-- pode editar poderia salvar a linha num estado que ele proprio nao alcanca.
drop policy if exists "Edicao de grupos de usuarios" on public.grupos_usuarios;
create policy "Edicao de grupos de usuarios" on public.grupos_usuarios
  for update to authenticated
  using (public.pode_administrar_grupos_usuarios())
  with check (public.pode_administrar_grupos_usuarios());

-- 2) Membros -----------------------------------------------------------------
-- Aqui DELETE e necessario, ao contrario das outras tabelas: tirar alguem de
-- um grupo e apagar a linha de vinculo -- nao ha coluna `ativo` para
-- desligar, e nem faria sentido guardar historico de quem ja esteve num grupo
-- de usuarios.
--
-- Sem UPDATE: a tabela e so as duas colunas da chave primaria. Mover um
-- vinculo e apagar um e criar outro.

revoke insert, update, delete on public.grupos_usuarios_membros from authenticated;
grant insert (grupo_id, profile_id) on public.grupos_usuarios_membros to authenticated;
grant delete on public.grupos_usuarios_membros to authenticated;

drop policy if exists "Vinculo de membros por quem administra" on public.grupos_usuarios_membros;
create policy "Vinculo de membros por quem administra" on public.grupos_usuarios_membros
  for insert to authenticated
  with check (public.pode_administrar_grupos_usuarios());

drop policy if exists "Remocao de membros por quem administra" on public.grupos_usuarios_membros;
create policy "Remocao de membros por quem administra" on public.grupos_usuarios_membros
  for delete to authenticated
  using (public.pode_administrar_grupos_usuarios());

-- 3) Indice de busca ---------------------------------------------------------
-- A tela tem busca livre em nome e descricao, com `ilike '%termo%'` -- que nao
-- usa btree comum (ver o cabecalho da 0011).

create index if not exists grupos_usuarios_nome_trgm_idx
  on public.grupos_usuarios using gin (nome gin_trgm_ops);
create index if not exists grupos_usuarios_descricao_trgm_idx
  on public.grupos_usuarios using gin (descricao gin_trgm_ops);
