-- ============================================================================
-- VeloxLab — Correcoes de seguranca
--
-- Fecha duas falhas encontradas em auditoria:
--
-- 1. Escalada de privilegio no cadastro. O trigger handle_new_user lia o
--    `cargo` de raw_user_meta_data, que e preenchido pelo cliente na chamada
--    signUp(). Com cadastro publico aberto, qualquer pessoa poderia nascer
--    como GESTOR, contornando a revogacao de UPDATE feita na migration 0002:
--    aquela protege a alteracao, nao a criacao.
--
-- 2. Exposicao de dados pessoais. A policy de leitura de `profiles` usava
--    `using (true)`, permitindo que qualquer usuario autenticado lesse o
--    e-mail, o nome e a hierarquia de todos os demais.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Trigger deixa de aceitar o nivel de acesso vindo do cliente -------------
-- Todo cadastro nasce como OPERADOR. A promocao passa a ser um ato
-- deliberado, feito pelo painel, por SQL ou por endpoint com service_role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo, cargo, funcao, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    -- Valor fixo de proposito: nao ler de raw_user_meta_data, que e
    -- controlado por quem chama signUp().
    'OPERADOR',
    new.raw_user_meta_data ->> 'funcao',
    new.email
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o perfil de um novo usuario sempre como OPERADOR. O nivel de acesso
   nunca vem do cliente: aceita-lo permitiria auto-promocao no cadastro.';

-- 2) Leitura de perfis restrita ----------------------------------------------
-- Funcao auxiliar em security definer para consultar o nivel do usuario atual
-- sem recursao: uma policy sobre `profiles` que consultasse `profiles`
-- dispararia avaliacao infinita. Como security definer roda com o dono da
-- tabela, a consulta interna nao passa pelo RLS.

create or replace function public.nivel_acesso_atual()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select cargo from public.profiles where id = auth.uid();
$$;

revoke all on function public.nivel_acesso_atual() from public;
grant execute on function public.nivel_acesso_atual() to authenticated;

drop policy if exists "Perfis visíveis para usuários autenticados" on public.profiles;
drop policy if exists "Leitura do proprio perfil ou de gestao" on public.profiles;

create policy "Leitura do proprio perfil ou de gestao"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.nivel_acesso_atual() in ('GESTOR', 'SUPERVISOR')
  );
