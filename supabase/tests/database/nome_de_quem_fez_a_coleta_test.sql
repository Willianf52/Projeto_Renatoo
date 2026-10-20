-- ============================================================================
-- pgTAP — nome de quem fez a coleta (migration 0076)
--
--   1) INSPETOR le, pelo campo computado, o nome do inspetor que fez a visita.
--   2) INSPETOR recebe o nome dos outros em `usuarios_visiveis`.
--   3) `usuarios_visiveis` nao devolve e-mail nem login (so id, nome, cargo, ativo).
--   4) INSPETOR continua sem ler a linha de `profiles` de outro usuario.
--   5) Relatorio de Visitas de Supervisao traz o nome para o INSPETOR.
--   6) CLIENTE nao recebe o nome de quem fez a visita.
--   7) CLIENTE recebe so a propria linha em `usuarios_visiveis`.
--   8) Usuario inativo recebe so a propria linha.
--   9) anon nao executa as funcoes novas.
-- ============================================================================

begin;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0760000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n76.inspetor.a@teste.local'),
  ('f0760000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n76.inspetor.b@teste.local'),
  ('f0760000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n76.cliente@teste.local'),
  ('f0760000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n76.inativo@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR', nome_completo = 'Inspetor A 0076'
  where id = 'f0760000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'INSPETOR', nome_completo = 'Inspetor B 0076'
  where id = 'f0760000-0000-0000-0000-000000000002';
update public.profiles set ativo = true, cargo = 'CLIENTE', nome_completo = 'Cliente 0076'
  where id = 'f0760000-0000-0000-0000-000000000003';
update public.profiles set ativo = false, cargo = 'OPERADOR', nome_completo = 'Inativo 0076'
  where id = 'f0760000-0000-0000-0000-000000000004';

insert into public.grupos_sites (nome) values ('Grupo 0076');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0076' from public.grupos_sites where nome = 'Grupo 0076';
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select '0076-a', s.id, 'f0760000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site 0076';
insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0076-a';

-- INSPETOR B ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0760000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select public.nome_do_funcionario(v) from public.visitas v where v.numero_coleta = '0076-a'),
  'Inspetor A 0076',
  'INSPETOR le o nome de quem fez a visita'
);

select is(
  (select nome_completo from public.usuarios_visiveis() where id = 'f0760000-0000-0000-0000-000000000001'),
  'Inspetor A 0076',
  'INSPETOR recebe o nome dos outros usuarios'
);

select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
     from information_schema.parameters
    where specific_name = (select specific_name from information_schema.routines
                            where routine_schema = 'public' and routine_name = 'usuarios_visiveis')
      and parameter_mode = 'OUT'),
  'id,nome_completo,cargo,ativo',
  'usuarios_visiveis devolve so id, nome, cargo e ativo (sem e-mail nem login)'
);

select is(
  (select count(*)::int from public.profiles where id = 'f0760000-0000-0000-0000-000000000001'),
  0,
  'INSPETOR continua sem ler a linha de profiles de outro usuario'
);

select is(
  (select funcionario from public.relatorio_visitas_de_supervisao(
     (select id from public.sites where nome = 'Site 0076'), now() - interval '1 day', now() + interval '1 day')),
  'Inspetor A 0076',
  'Visitas de Supervisao traz o nome de quem fez a visita'
);

-- CLIENTE ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0760000-0000-0000-0000-000000000003", "role": "authenticated"}';

select is(
  autorizacao.nome_do_perfil('f0760000-0000-0000-0000-000000000001'),
  null,
  'CLIENTE nao recebe o nome de usuario de outro'
);

select is(
  (select array_agg(id::text) from public.usuarios_visiveis()),
  array['f0760000-0000-0000-0000-000000000003'],
  'CLIENTE recebe so a propria linha'
);

-- INATIVO ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "f0760000-0000-0000-0000-000000000004", "role": "authenticated"}';

select is(
  (select array_agg(id::text) from public.usuarios_visiveis()),
  array['f0760000-0000-0000-0000-000000000004'],
  'usuario inativo recebe so a propria linha'
);

reset role;

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('autorizacao', 'nome_do_perfil'), ('autorizacao', 'usuarios_visiveis'),
                                     ('public', 'usuarios_visiveis'), ('public', 'nome_do_funcionario'))
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon nao executa as funcoes da 0076'
);

select * from finish();

rollback;
