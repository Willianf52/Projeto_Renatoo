-- ============================================================================
-- pgTAP -- foto do usuario (migration 0112)
--
--   1) A pessoa registra a propria foto; nao registra a de outra pessoa.
--   2) O GESTOR registra a foto de outra pessoa e ve as de todos.
--   3) Cada um (que nao e GESTOR) ve so a propria.
--   4) O bucket e privado, so imagem e ate 2 MB.
-- ============================================================================

begin;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001121', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foto.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001122', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foto.ana@teste.local'),
  ('f0000000-0000-0000-0000-000000001123', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'foto.bia@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001121';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id in ('f0000000-0000-0000-0000-000000001122', 'f0000000-0000-0000-0000-000000001123');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001122", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.fotos_de_usuario (usuario_id) values ('f0000000-0000-0000-0000-000000001122') $$,
  'a pessoa registra a propria foto'
);

select throws_ok(
  $$ insert into public.fotos_de_usuario (usuario_id) values ('f0000000-0000-0000-0000-000000001123') $$,
  '42501', null,
  'a pessoa nao registra foto de outra pessoa'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001121", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.fotos_de_usuario (usuario_id) values ('f0000000-0000-0000-0000-000000001123') $$,
  'o GESTOR registra a foto de outra pessoa'
);

select is(
  (select count(*)::int from public.fotos_de_usuario where usuario_id::text like 'f0000000-0000-0000-0000-00000000112_'),
  2,
  'o GESTOR ve as fotos de todos'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001123", "role": "authenticated"}';

select is(
  (select array_agg(usuario_id) from public.fotos_de_usuario where usuario_id::text like 'f0000000-0000-0000-0000-00000000112_'),
  array['f0000000-0000-0000-0000-000000001123']::uuid[],
  'quem nao e GESTOR ve so a propria foto'
);

reset role;

select is(
  (select public from storage.buckets where id = 'fotos-de-usuario'),
  false,
  'o bucket das fotos e privado'
);

select is(
  (select array[file_size_limit::text, array_to_string(allowed_mime_types, ',')] from storage.buckets where id = 'fotos-de-usuario'),
  array['2097152', 'image/jpeg,image/png,image/webp'],
  'so imagem, ate 2 MB'
);

select * from finish();
rollback;
