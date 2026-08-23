-- ============================================================================
-- VeloxLab — Blindagem de `profiles` e remocao de grants excedentes
--
-- Tres achados da auditoria de AppSec de 2026-08-23. Nenhum deles e
-- exploravel hoje; os tres sao camada que falta, nao buraco aberto.
--
-- 1) ESCALACAO DE PRIVILEGIO EM `profiles` DEPENDE DE UMA CAMADA SO.
--    A policy de UPDATE e `(auth.uid() = id) and usuario_ativo()` -- ela nao
--    restringe COLUNA nenhuma. O que impede um usuario de se promover a
--    GESTOR e exclusivamente o grant por coluna da 0007, que concede apenas
--    `nome_completo`. Um `grant update on public.profiles to authenticated`
--    -- uma linha, plausivel numa migration desatenta -- daria auto-promocao
--    imediata a qualquer usuario ativo. Este arquivo adiciona a segunda
--    camada, no lugar onde o Postgres consegue comparar OLD com NEW: um
--    trigger.
--
-- 2) ESCRITA DE SESSAO EM `profiles` NAO DEIXA TRILHA. A auditoria de
--    `profiles` existe e e deliberada -- ver o cabecalho de
--    `cadastros/usuarios/actions.ts`: a rota grava em `auditoria`
--    explicitamente porque a conexao de `service_role` nao carrega JWT, e
--    `auth.uid()` dentro de um trigger seria sempre null, perdendo o ator.
--    Essa decisao continua valendo e NAO e revertida aqui.
--
--    O que ficou descoberto e o outro caminho: o usuario editando o proprio
--    `nome_completo` pelo token da sessao nao passa por aquela rota e nao
--    gera linha nenhuma. O trigger abaixo cobre exatamente esse caso, com
--    `when (auth.uid() is not null)` -- condicao que e verdadeira so na
--    escrita vinda de sessao e falsa na do `service_role`. Sem a clausula,
--    toda edicao pelo painel geraria DUAS linhas em `auditoria`: a explicita
--    (com ator) e a do trigger (sem ator).
--
-- 3) TRES GRANTS DELETE SEM POLICY CORRESPONDENTE. `grupos_sites`,
--    `qr_codes` e `sites` concedem DELETE a `authenticated` e nao tem policy
--    de DELETE -- o RLS nega por ausencia, entao o grant e sobra pura.
--    `grupos_usuarios` e `grupos_usuarios_membros` tem policy e ficam como
--    estao.
--
-- Idempotente: `create or replace`, `drop trigger if exists` e revoke de
-- privilegio ausente sao todos no-op na segunda execucao.
-- ============================================================================

-- 1) Blindagem de cargo/ativo -----------------------------------------------
-- SECURITY INVOKER de proposito (o padrao): a funcao so compara OLD com NEW e
-- le `current_user`. Nao precisa de privilegio elevado, e definer aqui seria
-- superficie a toa.
--
-- `search_path = public, pg_temp` com `pg_temp` no FIM: o Postgres pesquisa o
-- schema temporario antes do search_path explicito quando ele nao aparece na
-- lista, e `authenticated` tem privilegio TEMP neste banco. Colocar `pg_temp`
-- por ultimo tira a possibilidade de um objeto temporario sombrear `profiles`
-- aqui dentro. As funcoes anteriores usam `search_path = public` e merecem o
-- mesmo tratamento numa migration propria.

create or replace function public.impedir_escalacao_de_perfil()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Escrita que nao vem do token de uma sessao passa direto: `service_role`
  -- (a rota de administracao de usuarios), `postgres` (migrations, SQL
  -- editor) e `supabase_admin`. E o caminho legitimo de mudanca de cargo
  -- hoje, e continua funcionando exatamente como antes.
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- GESTOR ativo pode administrar usuarios (0026). Hoje isso nunca acontece
  -- pelo token da sessao -- a rota usa `service_role` --, mas deixar a
  -- excecao explicita evita que um refactor futuro para o cliente da sessao
  -- esbarre num trigger sem entender por que.
  if public.pode_administrar_usuarios() then
    return new;
  end if;

  if new.cargo is distinct from old.cargo then
    raise exception
      'Alteracao de cargo nao e permitida pelo token da sessao.'
      using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo then
    raise exception
      'Alteracao de status ativo nao e permitida pelo token da sessao.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.impedir_escalacao_de_perfil() is
  'Trigger BEFORE UPDATE em profiles: recusa mudanca de cargo/ativo vinda do token da sessao. Segunda camada do grant por coluna da 0007.';

-- Nao e chamavel como RPC (trigger sem NEW/OLD falha), mas o grant nem
-- deveria existir -- mesmo cuidado da 0034 com `registrar_auditoria`.
revoke all on function public.impedir_escalacao_de_perfil() from public;

drop trigger if exists impedir_escalacao_trigger on public.profiles;
create trigger impedir_escalacao_trigger
  before update on public.profiles
  for each row execute function public.impedir_escalacao_de_perfil();

-- 2) Trilha de auditoria para a escrita de sessao ---------------------------
-- Reusa `registrar_auditoria()` (0034) sem alteracao. A clausula `when` e o
-- que evita duplicar a linha que a rota de usuarios ja grava: ela escreve com
-- `service_role`, onde `auth.uid()` e null e o trigger nao dispara.

drop trigger if exists auditoria_trigger on public.profiles;
create trigger auditoria_trigger
  after insert or update or delete on public.profiles
  for each row
  when (auth.uid() is not null)
  execute function public.registrar_auditoria();

-- 3) Grants DELETE excedentes ------------------------------------------------
-- Sem policy de DELETE, o RLS ja nega. Revogar alinha o grant ao que a
-- aplicacao realmente faz e devolve o principio da 0031: o grant e o piso, a
-- policy e o portao -- nao o contrario.
--
-- `grupos_usuarios` e `grupos_usuarios_membros` NAO entram: as duas tem
-- policy de DELETE ("Remocao de membros por quem administra") e a tela de
-- grupos de usuarios depende delas.

revoke delete on public.grupos_sites from authenticated;
revoke delete on public.qr_codes from authenticated;
revoke delete on public.sites from authenticated;
