-- ============================================================================
-- pgTAP — Conta nova nasce inativa e como OPERADOR
--
-- Cobre o trigger `handle_new_user` (migrations 0005 e 0008): mesmo que quem
-- chame signUp() tente mandar `cargo: "GESTOR"` e `ativo: true` no
-- `raw_user_meta_data`, o perfil criado tem que nascer OPERADOR e inativo --
-- e exatamente o vetor de escalada de privilegio que aquelas migrations
-- fecharam.
--
-- Roda como o role de conexao do teste (postgres/service_role), que e quem
-- tem INSERT em auth.users; nao precisa trocar de role porque o trigger e
-- security definer.
--
-- NAO EXECUTADO NESTE AMBIENTE: sem Docker aqui para `supabase start`. Rodar
-- com `supabase test db --local supabase/tests/database` antes de confiar.
-- ============================================================================

begin;

select plan(4);

-- Tenta se auto-promover via raw_user_meta_data, o mesmo vetor que a
-- migration 0005 fechou para `cargo` e a 0008 fechou para `ativo`.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'novo-usuario@teste.local',
  '{"cargo": "GESTOR", "ativo": true, "nome_completo": "Novo Usuario"}'::jsonb
);

select is(
  (select cargo from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'OPERADOR',
  'handle_new_user ignora o cargo vindo de raw_user_meta_data e cria como OPERADOR'
);

select is(
  (select ativo from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  false,
  'handle_new_user ignora o ativo vindo de raw_user_meta_data e cria como inativo'
);

-- funcao e nome_completo continuam vindo do metadata: so cargo e ativo sao
-- travados, o resto do cadastro segue livre (migrations 0003/0008).
select is(
  (select nome_completo from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Novo Usuario',
  'nome_completo continua vindo de raw_user_meta_data normalmente'
);

select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'exatamente um perfil e criado por usuario novo'
);

select * from finish();

rollback;
