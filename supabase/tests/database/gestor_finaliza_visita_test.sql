-- ============================================================================
-- pgTAP — GESTOR finaliza visita, e o checklist guarda quem enviou (0059)
--
--   1) GESTOR grava checklist, resposta e foto na visita de um INSPETOR.
--   2) `enviado_por` desse checklist e o GESTOR, nao o dono da visita.
--   3) O cliente nao escolhe o autor: o INSPETOR que manda `enviado_por` de
--      outra pessoa tem o valor trocado pelo proprio id (trigger).
--   4) SUPERVISOR nao grava checklist -- so GESTOR entrou (decisao do dono).
--   5) GESTOR inativo nao grava checklist.
--   6) INSPETOR continua sem gravar na visita de outro inspetor (o caminho do
--      inspetor nao foi afrouxado junto).
--   7) GESTOR envia midia para a pasta da visita no bucket `checklists`.
--   8) SUPERVISOR nao envia midia.
--   9) INSPETOR nao envia midia para a pasta de visita alheia -- a policy de
--      storage ainda nao tinha pgTAP nenhum ate aqui.
--  10) A amarra da 0045 continua valendo para o GESTOR: foto fora da pasta da
--      propria visita e recusada.
--  11) Ninguem ganhou UPDATE: checklist enviado segue imutavel.
--
-- Ids de linha alheia vao para `ids_teste` (sem RLS) antes de trocar de role,
-- pelo motivo registrado em `checklist_de_visitas_test.sql`: sem isso a policy
-- de SELECT esconde a linha e o teste passa pelo motivo errado.
--
-- Visitas nascem pelo INSPETOR: desde a 0054 o INSERT em `visitas` e grant por
-- coluna, e so o inspetor passa na policy.
-- ============================================================================

begin;

select plan(11);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000059', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g59.inspetor.a@teste.local'),
  ('f0000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g59.inspetor.b@teste.local'),
  ('f0000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g59.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g59.gestor.inativo@teste.local'),
  ('f0000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g59.supervisor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0000000-0000-0000-0000-000000000059', 'f0000000-0000-0000-0000-000000000060');
update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'f0000000-0000-0000-0000-000000000061';
update public.profiles set ativo = false, cargo = 'GESTOR'
  where id = 'f0000000-0000-0000-0000-000000000062';
update public.profiles set ativo = true, cargo = 'SUPERVISOR'
  where id = 'f0000000-0000-0000-0000-000000000063';

insert into public.grupos_sites (nome) values ('Grupo 0059');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0059' from public.grupos_sites where nome = 'Grupo 0059';

-- `ordem` alta pelo mesmo motivo de `checklist_de_visitas_test.sql`: a unique
-- de ordem e global e producao ja ocupa as baixas.
insert into public.perguntas_checklist (ordem, texto) values (9959, 'Pergunta 0059');

-- Tres visitas do INSPETOR A: uma para o GESTOR fechar, uma para o proprio A
-- fechar, uma para as tentativas que devem ser recusadas.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000059", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select c, s.id, 'f0000000-0000-0000-0000-000000000059'
  from public.sites s, unnest(array['0059-gestor', '0059-inspetor', '0059-recusa']) as c
  where s.nome = 'Site 0059';

reset role;

insert into ids_teste (chave, valor) select 'v_gestor', id from public.visitas where numero_coleta = '0059-gestor';
insert into ids_teste (chave, valor) select 'v_inspetor', id from public.visitas where numero_coleta = '0059-inspetor';
insert into ids_teste (chave, valor) select 'v_recusa', id from public.visitas where numero_coleta = '0059-recusa';

-- ---------------------------------------------------------------------------
-- 1) GESTOR grava checklist, resposta e foto na visita do INSPETOR A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000061", "role": "authenticated"}';

insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select valor, 'CONSULTORIA', valor || '/assinatura.png' from ids_teste where chave = 'v_gestor';

insert into public.checklist_respostas (checklist_id, pergunta_id, resposta)
  select c.id, p.id, 'SIM'
  from public.checklists_visita c
  cross join public.perguntas_checklist p
  where c.visita_id = (select valor from ids_teste where chave = 'v_gestor') and p.ordem = 9959;

insert into public.checklist_fotos (checklist_id, storage_path)
  select c.id, c.visita_id || '/foto-1.jpg'
  from public.checklists_visita c
  where c.visita_id = (select valor from ids_teste where chave = 'v_gestor');

reset role;

select is(
  (select count(*)::int
     from public.checklist_respostas r
     join public.checklists_visita c on c.id = r.checklist_id
    where c.visita_id = (select valor from ids_teste where chave = 'v_gestor'))
  + (select count(*)::int
     from public.checklist_fotos f
     join public.checklists_visita c on c.id = f.checklist_id
    where c.visita_id = (select valor from ids_teste where chave = 'v_gestor')),
  2,
  'GESTOR grava checklist, resposta e foto na visita de um inspetor'
);

insert into ids_teste (chave, valor)
  select 'chk_gestor', id from public.checklists_visita
   where visita_id = (select valor from ids_teste where chave = 'v_gestor');

-- ---------------------------------------------------------------------------
-- 2) Quem enviou foi o GESTOR.
-- ---------------------------------------------------------------------------
select is(
  (select enviado_por from public.checklists_visita
    where id = (select valor from ids_teste where chave = 'chk_gestor')),
  'f0000000-0000-0000-0000-000000000061'::uuid,
  'enviado_por guarda o GESTOR, e nao o dono da visita'
);

-- ---------------------------------------------------------------------------
-- 3) O INSPETOR tenta assinar como o GESTOR: o trigger troca pelo proprio id.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000059", "role": "authenticated"}';

insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, enviado_por)
  select valor, 'CORRETIVA', 'motivo', valor || '/assinatura.png', 'f0000000-0000-0000-0000-000000000061'
  from ids_teste where chave = 'v_inspetor';

reset role;

select is(
  (select enviado_por from public.checklists_visita
    where visita_id = (select valor from ids_teste where chave = 'v_inspetor')),
  'f0000000-0000-0000-0000-000000000059'::uuid,
  'enviado_por vindo do cliente e ignorado: vale quem esta na sessao'
);

-- ---------------------------------------------------------------------------
-- 4) SUPERVISOR nao grava checklist.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000063", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
       values (%1$L, 'CORRETIVA', 'supervisor', '%1$s/x.png') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  '42501',
  null,
  'SUPERVISOR nao grava checklist -- so GESTOR entrou'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5) GESTOR inativo nao grava checklist.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000062", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
       values (%1$L, 'CORRETIVA', 'inativo', '%1$s/x.png') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  '42501',
  null,
  'GESTOR inativo nao grava checklist'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6) INSPETOR B segue sem gravar na visita do INSPETOR A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000060", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
       values (%1$L, 'CORRETIVA', 'invadindo', '%1$s/x.png') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  '42501',
  null,
  'INSPETOR continua sem gravar checklist em visita de outro inspetor'
);

-- ---------------------------------------------------------------------------
-- 9) INSPETOR B nao envia midia para a pasta da visita do INSPETOR A.
--    (Fora de ordem so para aproveitar a sessao do B.)
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('checklists', '%s/invasor.png') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  '42501',
  null,
  'INSPETOR nao envia midia para a pasta de visita alheia'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7) GESTOR envia midia para a pasta da visita.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000061", "role": "authenticated"}';

select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('checklists', '%s/foto-gestor.jpg') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  'GESTOR envia midia para a pasta da visita'
);

-- ---------------------------------------------------------------------------
-- 10) A amarra de caminho da 0045 vale para o GESTOR tambem.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklist_fotos (checklist_id, storage_path)
       values (%L, %L) $$,
    (select valor from ids_teste where chave = 'chk_gestor'),
    (select valor from ids_teste where chave = 'v_inspetor') || '/fora-da-pasta.jpg'
  ),
  '42501',
  null,
  'GESTOR nao pendura foto fora da pasta da propria visita (0045)'
);

reset role;

-- ---------------------------------------------------------------------------
-- 8) SUPERVISOR nao envia midia.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000063", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('checklists', '%s/supervisor.png') $$,
    (select valor from ids_teste where chave = 'v_recusa')
  ),
  '42501',
  null,
  'SUPERVISOR nao envia midia'
);

reset role;

-- ---------------------------------------------------------------------------
-- 11) Ninguem ganhou UPDATE.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.checklists_visita', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.checklist_fotos', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.checklist_respostas', 'UPDATE'),
  'authenticated segue sem UPDATE nas tabelas do checklist'
);

select * from finish();

rollback;
