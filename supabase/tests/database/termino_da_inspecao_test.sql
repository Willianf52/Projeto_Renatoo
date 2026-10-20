-- ============================================================================
-- pgTAP — Termino da inspecao (migration 0077)
--
--   1) O INSPETOR grava a leitura "Termino" da propria visita (Encerrar ronda).
--   2) Um segundo Termino mais tarde nao cria linha: move o existente.
--   3) ... e o existente fica no horario mais tarde.
--   4) Um Termino mais cedo nao cria linha nem volta o horario.
--   5) O envio do checklist leva o Termino para a hora do checklist.
--   6) Checklist em visita sem leitura nao cria Termino.
--   7) `visitas_do_periodo` acha o Inicio na leitura sem area e o Termino.
-- ============================================================================

begin;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values ('f0770000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't77.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0770000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo 0077');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0077' from public.grupos_sites where nome = 'Grupo 0077';

create temporary table ids_teste (chave text primary key, valor bigint);
grant select on ids_teste to public;
insert into ids_teste select 'termino', id from public.areas where nome = 'Término';

-- Duas visitas do inspetor: uma com leitura de QR, outra sem leitura nenhuma.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0770000-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select k, s.id, 'f0770000-0000-0000-0000-000000000001'
    from public.sites s cross join (values ('0077-a'), ('0077-b')) as c(k)
   where s.nome = 'Site 0077';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() - interval '30 minutes' from public.visitas v where v.numero_coleta = '0077-a';

-- 1) Encerrar ronda
insert into public.leituras (visita_id, area_id, data_hora)
  select v.id, (select valor from ids_teste where chave = 'termino'), now() - interval '20 minutes'
    from public.visitas v where v.numero_coleta = '0077-a';

reset role;

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-a' and l.area_id = (select valor from ids_teste where chave = 'termino')),
  1,
  'INSPETOR grava o Termino da propria visita'
);

-- 2) e 3) Termino mais tarde
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0770000-0000-0000-0000-000000000001", "role": "authenticated"}';
insert into public.leituras (visita_id, area_id, data_hora)
  select v.id, (select valor from ids_teste where chave = 'termino'), now() - interval '10 minutes'
    from public.visitas v where v.numero_coleta = '0077-a';
reset role;

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-a' and l.area_id = (select valor from ids_teste where chave = 'termino')),
  1,
  'Segundo Termino nao cria outra linha'
);

select ok(
  (select l.data_hora > now() - interval '11 minutes' from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-a' and l.area_id = (select valor from ids_teste where chave = 'termino')),
  'O Termino fica no horario mais tarde'
);

-- 4) Termino mais cedo
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0770000-0000-0000-0000-000000000001", "role": "authenticated"}';
insert into public.leituras (visita_id, area_id, data_hora)
  select v.id, (select valor from ids_teste where chave = 'termino'), now() - interval '25 minutes'
    from public.visitas v where v.numero_coleta = '0077-a';
reset role;

select ok(
  (select count(*) = 1 and min(l.data_hora) > now() - interval '11 minutes'
     from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-a' and l.area_id = (select valor from ids_teste where chave = 'termino')),
  'Termino mais cedo nao cria linha nem volta o horario'
);

-- 5) e 6) Checklist (corretiva: sem modelo nem respostas)
insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, criado_em)
  select v.id, 'CORRETIVA', 'Teste 0077', v.id || '/assinatura.png', now() - interval '2 minutes'
    from public.visitas v where v.numero_coleta in ('0077-a', '0077-b');

select ok(
  (select abs(extract(epoch from l.data_hora - (now() - interval '2 minutes'))) < 1
     from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-a' and l.area_id = (select valor from ids_teste where chave = 'termino')),
  'O envio do checklist leva o Termino para a hora do checklist'
);

select is(
  (select count(*)::int from public.leituras l join public.visitas v on v.id = l.visita_id
    where v.numero_coleta = '0077-b'),
  0,
  'Checklist em visita sem leitura nao cria Termino'
);

-- 7) Relatorios
select ok(
  (select p.inicio is not null and p.termino is not null and p.termino > p.inicio
     from public.visitas_do_periodo(now() - interval '1 day', now() + interval '1 day',
                                    jsonb_build_object('site', (select id from public.sites where nome = 'Site 0077'))) p),
  'visitas_do_periodo acha o Inicio na leitura sem area e o Termino'
);

select * from finish();

rollback;
