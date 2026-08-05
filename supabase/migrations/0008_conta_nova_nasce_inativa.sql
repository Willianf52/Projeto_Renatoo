-- ============================================================================
-- Conta nova nasce inativa
--
-- A anon key e publica por design: vai no bundle do navegador. Com o cadastro
-- por e-mail ligado no painel (que e o padrao do Supabase), qualquer pessoa na
-- internet chama /auth/v1/signup direto, sem passar pelo app -- que nem tem
-- tela de cadastro.
--
-- Ate aqui o trigger handle_new_user criava o perfil como OPERADOR (migration
-- 0005, que fechou a auto-promocao) e a coluna `ativo` caia no default da
-- migration 0003: `true`. Nivel baixo, mas ativo -- e `usuario_ativo()` e o
-- que destranca a leitura das tabelas de referencia (migration 0006). Uma
-- conta criada de fora enxergava `sites` com latitude e longitude,
-- `grupos_sites` e a lista inteira de `qr_codes`, ou seja, o codigo de todos
-- os checkpoints.
--
-- Desligar o cadastro publico no painel resolve, mas e uma caixa de selecao
-- que ninguem versiona e que volta sozinha ao restaurar um projeto. A garantia
-- passa a estar no banco: conta nova nasce inativa e alguem precisa ativar de
-- proposito.
--
-- Nao mexe em quem ja existe: `set default` so vale para linhas novas, e as
-- contas atuais continuam com o `ativo` que tem hoje.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Default da coluna -------------------------------------------------------

alter table public.profiles alter column ativo set default false;

-- 2) Trigger deixa de depender do default ------------------------------------
-- O insert abaixo passou a listar `ativo` de proposito. Com a coluna omitida,
-- a regra moraria so no default -- e um `set default true` futuro, feito sem
-- ligar uma coisa a outra, reabriria o cadastro de fora em silencio. Explicito
-- aqui, a intencao fica no mesmo lugar que a auditoria vai ler.
--
-- O restante da funcao segue igual a migration 0005: `cargo` fixo em OPERADOR,
-- nunca lido de raw_user_meta_data, que quem chama signUp() controla.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome_completo, cargo, funcao, email, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_completo', ''),
    'OPERADOR',
    new.raw_user_meta_data ->> 'funcao',
    new.email,
    false
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o perfil de um novo usuario sempre como OPERADOR e inativo. Nem o
   nivel de acesso nem a ativacao vem do cliente: aceita-los permitiria
   auto-promocao e auto-liberacao no cadastro. A ativacao e um ato
   deliberado, feito por painel, SQL ou service_role.';

comment on column public.profiles.ativo is
  'Libera o acesso do usuario. Nasce false; so muda por painel, SQL ou
   service_role -- nao ha grant de update nesta coluna para authenticated
   (migration 0007). O middleware derruba a sessao de quem estiver inativo.';
