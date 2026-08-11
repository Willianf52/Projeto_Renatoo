-- ============================================================================
-- pgTAP — UPDATE em cargo e ativo negado para authenticated
--
-- Cobre a migration 0007: o GRANT de UPDATE em `profiles` para
-- `authenticated` e coluna a coluna, e so `nome_completo` esta liberado.
-- `cargo` (auto-promocao) e `ativo` (auto-reativacao) ficam de fora do grant
-- -- e um bloqueio de GRANT, evolucao da RLS: o UPDATE lanca erro de
-- privilegio (42501) antes da policy ser avaliada.
--
-- Executado (2026-08-11) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback -- branch de desenvolvimento nao esta
-- disponivel no plano atual. 3/3 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(3);

insert into auth.users (id, instance_id, aud, role, email)
values ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@teste.local');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}';

select throws_ok(
  $$ update public.profiles set cargo = 'GESTOR' where id = '55555555-5555-5555-5555-555555555555' $$,
  '42501',
  null,
  'authenticated nao promove o proprio cargo (grant restrito a nome_completo na migration 0007)'
);

select throws_ok(
  $$ update public.profiles set ativo = true where id = '55555555-5555-5555-5555-555555555555' $$,
  '42501',
  null,
  'authenticated nao se autoativa (grant restrito a nome_completo na migration 0007)'
);

-- Contraste: a unica coluna liberada continua editavel pelo proprio usuario,
-- para deixar claro que o bloqueio acima e por coluna, nao a tabela inteira.
select lives_ok(
  $$ update public.profiles set nome_completo = 'Nome Atualizado' where id = '55555555-5555-5555-5555-555555555555' $$,
  'authenticated edita o proprio nome_completo normalmente'
);

reset role;

select * from finish();

rollback;
