-- ============================================================================
-- pgTAP -- varios checklists na mesma inspecao (migration 0114)
--
--   1) A visita aceita dois checklists; o reenvio (mesma assinatura), nao.
--   2) Enviar checklist NAO finaliza a inspecao (o Termino da 0096 nao conta).
--   3) O Termino gravado pelo app ("Finalizar inspecao") finaliza.
--   4) A meia-noite: fecha a de ontem com checklist; nao a de hoje nem a sem
--      checklist.
--   5) A meta conta visitas: dois checklists na mesma inspecao sao uma.
-- ============================================================================

begin;

select plan(9);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values ('f0000000-0000-0000-0000-000000001141', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'varios.inspetor@teste.local');
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001141';

insert into public.grupos_sites (nome) values ('Grupo 0114');
insert into public.sites (grupo_site_id, nome) select id, 'Site 0114' from public.grupos_sites where nome = 'Grupo 0114';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site 0114';

-- Visita de hoje (a do Finalizar), de ontem (a esquecida) e de ontem sem checklist.
insert into public.visitas (numero_coleta, site_id, funcionario_id, criado_em)
select c.numero, (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001141', c.quando
  from (values ('0114-hoje', now()), ('0114-ontem', now() - interval '1 day 2 hours'), ('0114-vazia', now() - interval '1 day 2 hours')) as c(numero, quando);
insert into ids_teste (chave, valor) select numero_coleta, id from public.visitas where numero_coleta like '0114-%';

-- 1) Dois checklists na mesma visita; o reenvio colide ----------------------
select lives_ok(
  format($$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
            values (%1$s, 'CORRETIVA', 'primeiro', '%1$s/a1.png'), (%1$s, 'CORRETIVA', 'segundo', '%1$s/a2.png') $$,
         (select valor from ids_teste where chave = '0114-hoje')),
  'a mesma inspecao recebe dois checklists'
);

select throws_ok(
  format($$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
            values (%1$s, 'CORRETIVA', 'reenvio', '%1$s/a1.png') $$,
         (select valor from ids_teste where chave = '0114-hoje')),
  '23505', null,
  'o reenvio do mesmo formulario (mesma assinatura) nao duplica'
);

-- 2) Enviar checklist nao finaliza -------------------------------------------
select ok(
  (select finalizada_em is null from public.visitas where numero_coleta = '0114-hoje'),
  'com checklists enviados, a inspecao segue em andamento'
);

select is(
  (select count(*)::int from public.leituras l join public.areas a on a.id = l.area_id
    where l.visita_id = (select valor from ids_teste where chave = '0114-hoje') and a.nome = 'Término'),
  1,
  'o envio grava um Termino so (empurrado para o ultimo checklist)'
);

-- 3) O Termino gravado pelo app finaliza --------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001141", "role": "authenticated"}';

select lives_ok(
  format($$ insert into public.leituras (visita_id, area_id, data_hora)
            values (%s, (select id from public.areas where nome = 'Término'), now()) $$,
         (select valor from ids_teste where chave = '0114-hoje')),
  'o inspetor grava o Termino do Finalizar inspecao'
);

reset role;

select ok(
  (select finalizada_em is not null from public.visitas where numero_coleta = '0114-hoje'),
  'o Termino gravado pelo app finaliza a inspecao'
);

-- 4) A meia-noite ---------------------------------------------------------------
-- Enviado ontem (fora do dia da meta do item 5).
insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, criado_em)
select valor, 'CORRETIVA', 'esquecida', valor || '/a.png', now() - interval '1 day 1 hour' from ids_teste where chave = '0114-ontem';

select manutencao.fechar_inspecoes_esquecidas();

select is(
  (select array_agg(numero_coleta order by numero_coleta) from public.visitas
    where numero_coleta like '0114-%' and finalizada_em is not null),
  array['0114-hoje', '0114-ontem'],
  'fecha a de ontem com checklist; a sem checklist fica como esta'
);

select ok(
  (select v.finalizada_em = (select max(l.data_hora) from public.leituras l join public.areas a on a.id = l.area_id
                              where l.visita_id = v.id and a.nome = 'Término')
     from public.visitas v where v.numero_coleta = '0114-ontem'),
  'a esquecida fecha na hora do ultimo checklist'
);

-- 5) A meta conta visitas -------------------------------------------------------
insert into public.metas_de_visita (usuario_id, site_id, quantidade, periodo, inicia_em)
values ('f0000000-0000-0000-0000-000000001141', (select valor from ids_teste where chave = 'site'), 5, 'DIARIA', current_date - 1);

select is(
  (select feitas from public.progresso_das_metas()
    where usuario_id = 'f0000000-0000-0000-0000-000000001141'),
  1,
  'dois checklists na mesma inspecao contam uma visita'
);

select * from finish();
rollback;
