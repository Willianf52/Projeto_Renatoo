-- ============================================================================
-- pgTAP — pode_administrar_usuarios() é só para GESTOR ativo
--
-- Cobre a migration 0013. A funcao merece teste proprio, e nao carona no de
-- `pode_administrar_cadastros()`, porque as duas reguas sao deliberadamente
-- diferentes: administrar cadastro inclui SUPERVISOR e OPERACIONAL (0009),
-- administrar usuario nao. Quem escreve `cargo` concede nivel de acesso, e a
-- diferenca entre as duas listas e exatamente o que impede um OPERACIONAL
-- capaz de cadastrar site de se promover a GESTOR.
--
-- Vale mais que o normal aqui: a escrita de usuario acontece com service_role
-- (`usuarios/actions.ts`), que ignora o RLS. Esta funcao nao e um portao a
-- mais atras de uma policy -- ela e o portao. Se ela devolver true para quem
-- nao deveria, nao ha nada depois para segurar.
--
-- NAO EXECUTADO NESTE AMBIENTE: sem Docker aqui para `supabase start`. Rodar
-- com `supabase test db --local supabase/tests/database` antes de confiar.
-- ============================================================================

begin;

select plan(6);

-- Fixture: um perfil de cada nivel que importa, todos ativos, mais um GESTOR
-- inativo para o ramo de `usuario_ativo()`.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor@teste.local'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'supervisor@teste.local'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operacional@teste.local'),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador@teste.local'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente@teste.local'),
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.inativo@teste.local');

update public.profiles set ativo = true where id <> 'a0000000-0000-0000-0000-000000000006';

update public.profiles set cargo = 'GESTOR'      where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set cargo = 'SUPERVISOR'  where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set cargo = 'OPERACIONAL' where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set cargo = 'OPERADOR'    where id = 'a0000000-0000-0000-0000-000000000004';
update public.profiles set cargo = 'CLIENTE'     where id = 'a0000000-0000-0000-0000-000000000005';
update public.profiles set cargo = 'GESTOR', ativo = false
  where id = 'a0000000-0000-0000-0000-000000000006';

-- GESTOR ativo: o unico caso que autoriza.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(public.pode_administrar_usuarios(), true, 'GESTOR ativo administra usuarios');
reset role;

-- SUPERVISOR administra cadastro (0009) mas nao usuario. E a diferenca que
-- justifica a funcao separada.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000002", "role": "authenticated"}';
select is(public.pode_administrar_usuarios(), false, 'SUPERVISOR nao administra usuarios');
select is(public.pode_administrar_cadastros(), true, 'SUPERVISOR segue administrando cadastros');
reset role;

-- OPERACIONAL, idem: cadastra site, nao promove ninguem.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000003", "role": "authenticated"}';
select is(public.pode_administrar_usuarios(), false, 'OPERACIONAL nao administra usuarios');
reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000004", "role": "authenticated"}';
select is(public.pode_administrar_usuarios(), false, 'OPERADOR nao administra usuarios');
reset role;

-- GESTOR desativado perde a permissao junto com o acesso: `usuario_ativo()`
-- entra na conjuncao, entao o nivel sozinho nao basta.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a0000000-0000-0000-0000-000000000006", "role": "authenticated"}';
select is(public.pode_administrar_usuarios(), false, 'GESTOR inativo nao administra usuarios');
reset role;

select * from finish();

rollback;
