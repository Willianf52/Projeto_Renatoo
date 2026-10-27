-- ============================================================================
-- 0078 — Inativar um usuario encerra as sessoes dele
--
-- Desativar uma conta (Cadastros > Usuarios ou a importacao) ja corta os
-- DADOS na hora: toda funcao de `autorizacao` passa por `usuario_ativo()`, e o
-- middleware do painel devolve para o login com "acesso-indisponivel". O que
-- sobrava era a SESSAO. O refresh token da conta inativada continuava sendo
-- renovado pelo Auth do Supabase, entao o app de campo seguia "logado" (sem
-- enxergar nada) e o token continuava valendo para o que nao passa pelo RLS,
-- como a API do proprio Auth (revisao de seguranca de 27/10/2026).
--
-- O gatilho apaga as sessoes da conta quando `ativo` vira false. Os refresh
-- tokens caem junto (FK `refresh_tokens_session_id_fkey` com ON DELETE
-- CASCADE); os sem sessao, de antes de o Auth ter sessoes, sao apagados pelo
-- `user_id`. Na proxima renovacao o app e o painel recebem "refresh token nao
-- encontrado" e saem. O token de acesso ja emitido vale ate expirar (1 hora),
-- mas nesse intervalo o RLS ja nega tudo.
--
-- Gatilho no banco, e nao uma chamada `auth.admin.signOut` na Server Action:
-- a regra vale para qualquer caminho que desative a conta (tela, importacao,
-- SQL no painel do Supabase), como o resto da autorizacao deste projeto.
-- Banir a conta (`ban_duration`) tambem fecharia a renovacao, mas mudaria o
-- login: o painel hoje mostra "acesso indisponivel" a quem foi desativado, e
-- banido o Auth recusaria antes, com outra mensagem.
--
-- `security definer` porque `authenticated` e `service_role` nao escrevem no
-- schema `auth`; quem executa e o dono (postgres), que tem DELETE la. Mora em
-- `manutencao`, fora da API, como `avisar_troca_de_senha` (0053).
--
-- Junto: RLS em `manutencao.contador_de_checklists` (0074). A tabela nao tem
-- grant para `anon` nem `authenticated` e so o gatilho `numerar_checklist`
-- (security definer, dono da tabela) escreve nela, entao nada muda; e a
-- unica tabela do banco sem RLS, e passa a ter a mesma segunda barreira das
-- outras caso um grant apareca por engano.
-- ============================================================================

create or replace function manutencao.encerrar_sessoes_ao_inativar()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  delete from auth.refresh_tokens where user_id = new.id::text;
  delete from auth.sessions where user_id = new.id;
  return null;
end;
$$;

revoke all on function manutencao.encerrar_sessoes_ao_inativar() from public, anon, authenticated;

drop trigger if exists encerrar_sessoes_ao_inativar on public.profiles;
create trigger encerrar_sessoes_ao_inativar
  after update of ativo on public.profiles
  for each row
  when (old.ativo and not new.ativo)
  execute function manutencao.encerrar_sessoes_ao_inativar();

alter table manutencao.contador_de_checklists enable row level security;
