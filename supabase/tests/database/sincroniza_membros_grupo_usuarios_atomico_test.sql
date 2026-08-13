-- ============================================================================
-- pgTAP — sincronizar_membros_grupo_usuarios() e atomica
--
-- Cobre a migration 0026. O ponto nao e so "funciona no caminho feliz" -- e
-- que um INSERT que falhe no meio nao pode deixar o DELETE que rodou antes
-- dele, na mesma chamada, committado sozinho. Antes da 0026 isso acontecia:
-- dois `.from()` separados, cada um sua propria transacao PostgREST.
--
-- Tambem cobre que a autorizacao continua sendo a policy de RLS de
-- `grupos_usuarios_membros` (migration 0016) -- a funcao e `security invoker`
-- de proposito, nao reimplementa a checagem.
--
-- Executado (2026-08-13) direto contra o projeto de producao, dentro de uma
-- transacao com rollback. 9/9 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(9);

-- Fixture: um GESTOR (autoriza), um OPERADOR (nao autoriza) e um grupo com
-- um membro inicial.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.sincroniza@teste.local'),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operador.sincroniza@teste.local'),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'membro.inicial@teste.local'),
  ('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'membro.novo@teste.local');

update public.profiles set ativo = true where id::text like 'e0000000%';
update public.profiles set cargo = 'GESTOR'   where id = 'e0000000-0000-0000-0000-000000000001';
update public.profiles set cargo = 'OPERADOR' where id = 'e0000000-0000-0000-0000-000000000002';

insert into public.grupos_usuarios (nome) values ('Grupo pgTAP sincroniza');

insert into public.grupos_usuarios_membros (grupo_id, profile_id)
select id, 'e0000000-0000-0000-0000-000000000003'
from public.grupos_usuarios where nome = 'Grupo pgTAP sincroniza';

-- ---------------------------------------------------------------------------
-- Caminho feliz: GESTOR substitui o membro inicial pelo novo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$
    select public.sincronizar_membros_grupo_usuarios(
      (select id from public.grupos_usuarios where nome = 'Grupo pgTAP sincroniza'),
      array['e0000000-0000-0000-0000-000000000004']::uuid[]
    )
  $$,
  'GESTOR sincroniza a lista de membros sem erro'
);

select is(
  (select count(*)::int from public.grupos_usuarios_membros gum
     join public.grupos_usuarios gu on gu.id = gum.grupo_id
     where gu.nome = 'Grupo pgTAP sincroniza' and gum.profile_id = 'e0000000-0000-0000-0000-000000000004'),
  1,
  'o membro novo entrou'
);

select is(
  (select count(*)::int from public.grupos_usuarios_membros gum
     join public.grupos_usuarios gu on gu.id = gum.grupo_id
     where gu.nome = 'Grupo pgTAP sincroniza' and gum.profile_id = 'e0000000-0000-0000-0000-000000000003'),
  0,
  'o membro inicial saiu'
);

-- ---------------------------------------------------------------------------
-- Atomicidade: um profile_id inexistente quebra a FK no INSERT. O DELETE que
-- rodou antes dele, na mesma chamada, tem que desfazer junto -- e o que a
-- versao antiga (dois `.from()` separados) nao garantia.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    select public.sincronizar_membros_grupo_usuarios(
      (select id from public.grupos_usuarios where nome = 'Grupo pgTAP sincroniza'),
      array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[]
    )
  $$,
  '23503',
  null,
  'profile_id inexistente quebra a FK no INSERT'
);

select is(
  (select count(*)::int from public.grupos_usuarios_membros gum
     join public.grupos_usuarios gu on gu.id = gum.grupo_id
     where gu.nome = 'Grupo pgTAP sincroniza' and gum.profile_id = 'e0000000-0000-0000-0000-000000000004'),
  1,
  'a chamada que falhou nao apagou o membro que ja estava la -- o DELETE desfez junto com o INSERT'
);

reset role;

-- ---------------------------------------------------------------------------
-- Autorizacao: OPERADOR nao administra grupos de usuarios (migration 0016).
-- security invoker garante que a policy de RLS ainda vale dentro da funcao.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

select throws_ok(
  $$
    select public.sincronizar_membros_grupo_usuarios(
      (select id from public.grupos_usuarios where nome = 'Grupo pgTAP sincroniza'),
      array['e0000000-0000-0000-0000-000000000003']::uuid[]
    )
  $$,
  '42501',
  null,
  'OPERADOR nao sincroniza membros de grupo de usuarios'
);

reset role;

select is(
  (select count(*)::int from public.grupos_usuarios_membros gum
     join public.grupos_usuarios gu on gu.id = gum.grupo_id
     where gu.nome = 'Grupo pgTAP sincroniza' and gum.profile_id = 'e0000000-0000-0000-0000-000000000004'),
  1,
  'a tentativa nao autorizada nao mudou a lista de membros'
);

-- ---------------------------------------------------------------------------
-- Lista vazia esvazia o grupo -- o caso "desmarcar todo mundo".
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$
    select public.sincronizar_membros_grupo_usuarios(
      (select id from public.grupos_usuarios where nome = 'Grupo pgTAP sincroniza'),
      array[]::uuid[]
    )
  $$,
  'GESTOR sincroniza com lista vazia sem erro'
);

reset role;

select is(
  (select count(*)::int from public.grupos_usuarios_membros gum
     join public.grupos_usuarios gu on gu.id = gum.grupo_id
     where gu.nome = 'Grupo pgTAP sincroniza'),
  0,
  'lista vazia esvazia o grupo'
);

select * from finish();

rollback;
