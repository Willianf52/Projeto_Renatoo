-- ============================================================================
-- VeloxLab — Exclusão de grupos de usuários
--
-- A 0016 abriu a escrita de `grupos_usuarios` pela metade: insert e update
-- ganharam grant e policy, delete não. O efeito era um cadastro sem saída --
-- dava para criar e editar grupos pela tela, nunca para remover um criado por
-- engano. A remoção só era possível por fora do app, o que não é uma opção
-- para quem usa o sistema.
--
-- Não é o padrão de desativação usado em `grupos_sites` e `sites`, e por um
-- motivo concreto: aquelas tabelas têm coluna `ativo` para isso, e
-- `grupos_usuarios` não tem. Entre inventar uma coluna de situação para um
-- cadastro que é só nome, descrição e uma lista de gente, ou apagar de fato, a
-- segunda é mais honesta -- um grupo desativado que ninguém enxerga é lixo com
-- outro nome.
--
-- Os vínculos em `grupos_usuarios_membros` somem junto, sem precisar de nada
-- aqui: a FK da 0003 é `on delete cascade`, e o cascade roda com as permissões
-- do dono da tabela, sem passar pelo RLS da tabela filha.
--
-- Mesma régua das demais operações deste cadastro:
-- `pode_administrar_grupos_usuarios()`, que exige administrar cadastro E
-- enxergar a operação inteira. Apagar não pode ser mais fácil que editar.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- `delete` não é por coluna: ou se apaga a linha inteira ou nada. Por isso não
-- há a lista de colunas que acompanha os grants de insert/update da 0016.
grant delete on public.grupos_usuarios to authenticated;

drop policy if exists "Remocao de grupos por quem administra" on public.grupos_usuarios;
create policy "Remocao de grupos por quem administra" on public.grupos_usuarios
  for delete to authenticated
  using (public.pode_administrar_grupos_usuarios());
