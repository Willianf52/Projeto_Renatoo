-- ============================================================================
-- pgTAP — OPERADOR não lê perfil alheio; GESTOR/SUPERVISOR leem
--
-- Cobre a policy "Leitura do proprio perfil ou de gestao" (criada na
-- migration 0005, substituida na 0006 para exigir `usuario_ativo()` no ramo
-- de gestao via `pode_ver_toda_operacao()`).
--
-- Simula os dois papeis trocando de role para `authenticated` e ajustando
-- `request.jwt.claims` -- e como `auth.uid()` le a sessao de verdade, e o
-- padrao documentado pela Supabase para testar RLS com pgTAP.
--
-- NAO EXECUTADO NESTE AMBIENTE: sem Docker aqui para `supabase start`. Rodar
-- com `supabase test db --local supabase/tests/database` antes de confiar.
-- ============================================================================

begin;

select plan(4);

-- Fixture: um OPERADOR e um GESTOR, os dois ativos (o ramo de gestao da
-- policy passou a exigir usuario_ativo() na migration 0006), mais um segundo
-- OPERADOR cujo perfil e o alvo da tentativa de leitura alheia.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador1@teste.local'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador2@teste.local'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@teste.local');

update public.profiles set ativo = true
  where id in (
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444'
  );
update public.profiles set cargo = 'GESTOR' where id = '44444444-4444-4444-4444-444444444444';

-- OPERADOR le o proprio perfil.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'OPERADOR le o proprio perfil'
);

select is(
  (select count(*)::int from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'OPERADOR nao le o perfil de outro OPERADOR'
);

reset role;

-- GESTOR ativo le a operacao inteira.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'GESTOR ativo le o perfil de um OPERADOR'
);

select is(
  (select count(*)::int from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  1,
  'GESTOR ativo le o perfil de outro OPERADOR'
);

reset role;

select * from finish();

rollback;
