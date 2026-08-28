-- ============================================================================
-- pgTAP — a midia do checklist mora na pasta da propria visita
--
-- Cobre a migration 0045 (achado M-4 da auditoria de 2026-08-28).
--
-- O que estas quatro asserts protegem: ate a 0045, `assinatura_path` e
-- `storage_path` eram texto livre. Quem garantia o formato
-- `{visita_id}/{arquivo}` era o esquema Zod do `packages/shared` -- que roda no
-- aparelho do inspetor, ou seja, no cliente que o proprio banco nao controla.
--
-- Repare no par 3/4: o INSPETOR aqui e dono das DUAS visitas. Nao e um teste
-- de "inspetor invade visita alheia" (isso ja e o caso 2 de
-- checklist_de_visitas_test.sql) -- e o caso mais estreito de um inspetor
-- legitimo pendurando, na visita A, o caminho da visita B. A policy antiga
-- aceitava, porque so conferia de quem era o checklist; a nova compara o
-- prefixo do caminho com o `visita_id` daquele checklist.
-- ============================================================================

begin;

select plan(4);

create temporary table ids_midia (chave text primary key, valor bigint);
grant select, insert on ids_midia to public;

-- Fixture: um INSPETOR ativo com duas visitas proprias.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'midia.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'a1000000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo Midia');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Midia' from public.grupos_sites where nome = 'Grupo Midia';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9301, s.id, 'a1000000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site Midia';
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9302, s.id, 'a1000000-0000-0000-0000-000000000001'
  from public.sites s where s.nome = 'Site Midia';

insert into ids_midia (chave, valor)
  select 'visita_1', id from public.visitas where numero_coleta = 9301;
insert into ids_midia (chave, valor)
  select 'visita_2', id from public.visitas where numero_coleta = 9302;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "a1000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- ---------------------------------------------------------------------------
-- 1) Assinatura fora da pasta da visita: recusada pelo check (23514).
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, assinatura_path)
       values (%1$L, 'CONSULTORIA', %2$L) $$,
    (select valor from ids_midia where chave = 'visita_1'),
    (select valor || '/assinatura.png' from ids_midia where chave = 'visita_2')
  ),
  '23514',
  null,
  'assinatura com o id de OUTRA visita e recusada pelo check da 0045'
);

-- ---------------------------------------------------------------------------
-- 2) Assinatura sem pasta nenhuma: mesmo check.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, assinatura_path)
       values (%1$L, 'CONSULTORIA', 'assinatura.png') $$,
    (select valor from ids_midia where chave = 'visita_1')
  ),
  '23514',
  null,
  'assinatura sem a pasta da visita e recusada pelo check da 0045'
);

-- ---------------------------------------------------------------------------
-- 3) O caminho correto passa -- a regra nova nao quebra o fluxo legitimo.
-- ---------------------------------------------------------------------------
insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
  from public.visitas v where v.numero_coleta = 9301;

select isnt_empty(
  format(
    $$ select 1 from public.checklists_visita where visita_id = %L $$,
    (select valor from ids_midia where chave = 'visita_1')
  ),
  'checklist com assinatura na propria pasta e gravado normalmente'
);

-- ---------------------------------------------------------------------------
-- 4) Foto apontando para a pasta da outra visita: recusada pela policy (42501).
--
-- Codigo diferente do caso 1 de proposito: aqui a amarra mora no `with check`
-- da policy, e nao num check constraint, porque `checklist_fotos` nao tem
-- `visita_id` na linha -- ele so existe via join. Ver o cabecalho da 0045.
-- ---------------------------------------------------------------------------
select throws_ok(
  format(
    $$ insert into public.checklist_fotos (checklist_id, storage_path)
       select c.id, %L
       from public.checklists_visita c where c.visita_id = %L $$,
    (select valor || '/foto-1.jpg' from ids_midia where chave = 'visita_2'),
    (select valor from ids_midia where chave = 'visita_1')
  ),
  '42501',
  null,
  'foto com o id de OUTRA visita e recusada pela policy da 0045'
);

reset role;

select * from finish();

rollback;
