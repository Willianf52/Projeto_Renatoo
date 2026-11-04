-- ============================================================================
-- pgTAP — assinaturas do checklist com o nome de quem assinou
--
-- Cobre a migration 0090: `checklist_assinaturas` e o argumento
-- `p_assinaturas` de `registrar_checklist`.
-- ============================================================================

begin;

select plan(6);

create temporary table ids_assin (chave text primary key, valor bigint);
grant select, insert on ids_assin to public;

-- Fixture: um INSPETOR ativo com tres visitas proprias.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assin.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'a2000000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo Assinaturas');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Assinaturas' from public.grupos_sites where nome = 'Grupo Assinaturas';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select n, s.id, 'a2000000-0000-0000-0000-000000000001'
  from public.sites s, (values ('9401'), ('9402'), ('9403')) as t(n)
  where s.nome = 'Site Assinaturas';

insert into ids_assin (chave, valor)
  select 'visita_' || right(numero_coleta, 1), id from public.visitas where numero_coleta in ('9401', '9402', '9403');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a2000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- ---------------------------------------------------------------------------
-- 1) Duas assinaturas com nome: duas linhas, na ordem enviada.
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    $$ select public.registrar_checklist(
         %1$L::bigint, 'CORRETIVA', 'Teste', %2$L, array[]::text[], '[]'::jsonb, null, '[]'::jsonb,
         jsonb_build_array(
           jsonb_build_object('nome', '  Willian ', 'storage_path', %2$L),
           jsonb_build_object('nome', 'Gesiel', 'storage_path', %3$L)
         )
       ) $$,
    (select valor from ids_assin where chave = 'visita_1'),
    (select valor || '/assinatura-a.png' from ids_assin where chave = 'visita_1'),
    (select valor || '/assinatura-b.png' from ids_assin where chave = 'visita_1')
  ),
  'o envio com duas assinaturas e aceito'
);

select results_eq(
  format(
    $$ select a.ordem::int, a.nome from public.checklist_assinaturas a
       join public.checklists_visita c on c.id = a.checklist_id
       where c.visita_id = %L order by a.ordem $$,
    (select valor from ids_assin where chave = 'visita_1')
  ),
  $$ values (1, 'Willian'::text), (2, 'Gesiel'::text) $$,
  'as duas assinaturas ficam na ordem enviada, com o nome sem espacos nas pontas'
);

-- ---------------------------------------------------------------------------
-- 2) Chamada antiga, sem p_assinaturas: uma linha, sem nome.
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    $$ select public.registrar_checklist(
         %1$L::bigint, 'CORRETIVA', 'Teste', %2$L, array[]::text[]
       ) $$,
    (select valor from ids_assin where chave = 'visita_2'),
    (select valor || '/assinatura.png' from ids_assin where chave = 'visita_2')
  ),
  'a chamada antiga, sem a lista de assinaturas, continua valendo'
);

select results_eq(
  format(
    $$ select a.ordem::int, a.nome, a.storage_path from public.checklist_assinaturas a
       join public.checklists_visita c on c.id = a.checklist_id
       where c.visita_id = %L $$,
    (select valor from ids_assin where chave = 'visita_2')
  ),
  format(
    $$ values (1, null::text, %L::text) $$,
    (select valor || '/assinatura.png' from ids_assin where chave = 'visita_2')
  ),
  'sem a lista, grava uma assinatura sem nome com o caminho informado'
);

-- ---------------------------------------------------------------------------
-- 3) Caminho da assinatura na pasta de OUTRA visita: recusado pela policy.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ select public.registrar_checklist(
         %1$L::bigint, 'CORRETIVA', 'Teste', %2$L, array[]::text[], '[]'::jsonb, null, '[]'::jsonb,
         jsonb_build_array(
           jsonb_build_object('nome', 'Fulano', 'storage_path', %2$L),
           jsonb_build_object('nome', 'Beltrano', 'storage_path', %3$L)
         )
       ) $$,
    (select valor from ids_assin where chave = 'visita_3'),
    (select valor || '/assinatura-a.png' from ids_assin where chave = 'visita_3'),
    (select valor || '/assinatura-b.png' from ids_assin where chave = 'visita_1')
  ),
  '42501',
  null,
  'assinatura com o caminho de OUTRA visita e recusada pela policy da 0090'
);

-- ---------------------------------------------------------------------------
-- 4) Quem assinou nao pode ser apagado nem alterado pelo aparelho.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.checklist_assinaturas set nome = 'Outro' $$,
  '42501',
  null,
  'o aparelho nao consegue alterar o nome de quem assinou'
);

reset role;

select * from finish();

rollback;
