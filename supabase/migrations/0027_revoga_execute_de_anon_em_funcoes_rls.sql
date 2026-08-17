-- ============================================================================
-- VeloxLab — Revoga EXECUTE de `anon` nas funções auxiliares de RLS
--
-- Achado pelo advisor de segurança do Supabase (auditoria 2026-08-16):
-- `e_cliente()`, `nivel_acesso_atual()`, `pode_administrar_cadastros()`,
-- `pode_administrar_grupos_usuarios()`, `pode_administrar_usuarios()`,
-- `pode_ver_grupo_site()`, `pode_ver_toda_operacao()` e `usuario_ativo()` são
-- `SECURITY DEFINER` e, por padrão do Postgres (EXECUTE concedido a PUBLIC na
-- criação), ficam chamáveis por qualquer um via `/rest/v1/rpc/<nome>`,
-- inclusive por quem não autenticou.
--
-- Revisado e confirmado sem vazamento de dado: todas leem só a partir de
-- `auth.uid()`, que é nulo para `anon` -- o retorno é sempre `false`/`null`,
-- nunca dado de outra pessoa. Ainda assim, reduzir a superfície pública é
-- barato e é exatamente o que o advisor recomenda.
--
-- `authenticated` NÃO entra neste revoke: as policies de RLS (`grupos_sites`,
-- `sites`, `qr_codes`, `visitas`, `leituras`, `profiles`, `grupos_usuarios*`)
-- chamam estas funções nas cláusulas USING/WITH CHECK, e essa chamada roda
-- com o privilégio do papel que está executando a query -- que é
-- `authenticated`, nunca o dono da função, mesmo sendo SECURITY DEFINER.
-- Revogar de `authenticated` quebraria toda política que depende delas. O
-- advisor também assinala isso para `authenticated`; é warning esperado e
-- inevitável nesta arquitetura, não um achado a corrigir.
--
-- `handle_new_user()` (trigger de auth.users, migration 0008) não é
-- alcançável por RPC de verdade -- funções `RETURNS TRIGGER` só podem ser
-- invocadas pelo motor de trigger, e o Postgres recusa qualquer chamada
-- direta com erro. O revoke aqui é só para o advisor parar de sinalizá-la;
-- não fecha nenhuma superfície que já não estivesse fechada.
-- ============================================================================

revoke execute on function public.e_cliente() from anon;
revoke execute on function public.nivel_acesso_atual() from anon;
revoke execute on function public.pode_administrar_cadastros() from anon;
revoke execute on function public.pode_administrar_grupos_usuarios() from anon;
revoke execute on function public.pode_administrar_usuarios() from anon;
revoke execute on function public.pode_ver_grupo_site(bigint) from anon;
revoke execute on function public.pode_ver_toda_operacao() from anon;
revoke execute on function public.usuario_ativo() from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
