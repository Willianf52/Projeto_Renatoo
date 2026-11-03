-- ============================================================================
-- pgTAP -- cadastro do Cliente (migration 0085)
--
--   1) A tabela nasce com uma linha e nao aceita segunda (unica).
--   2) O GESTOR le e edita; CNPJ fora do formato e recusado (23514).
--   3) O INSPETOR nao le (RLS) e a edicao dele nao muda nada.
-- ============================================================================

begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000851', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cli.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000852', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cli.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000851';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000852';

select is((select count(*)::int from public.cliente), 1, 'o cliente nasce com uma linha');

select throws_ok(
  $$ insert into public.cliente (unica, nome_fantasia) values (false, 'Outra') $$,
  '23514', null,
  'nao existe segunda linha de cliente'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000851", "role": "authenticated"}';

update public.cliente set titulo_pdf = 'Relatorio de Inspecao', min_caracteres_acoes = 10;

select results_eq(
  $$ select titulo_pdf, min_caracteres_acoes from public.cliente $$,
  $$ select 'Relatorio de Inspecao'::text, 10 $$,
  'o GESTOR le e edita as configuracoes'
);

select throws_ok(
  $$ update public.cliente set cnpj = '12.345' $$,
  '23514', null,
  'CNPJ fora do formato (14 digitos) e recusado'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000852", "role": "authenticated"}';

select is((select count(*)::int from public.cliente), 0, 'o INSPETOR nao le o cliente');

update public.cliente set titulo_pdf = 'Inspetor mudou';

reset role;

select is((select titulo_pdf from public.cliente), 'Relatorio de Inspecao', 'a edicao do INSPETOR nao muda nada');

select * from finish();
rollback;
