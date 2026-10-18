-- ============================================================================
-- pgTAP — Numero/Ano do checklist (migration 0074)
--
--   1) Nenhum checklist fica sem numero e ano (os antigos foram numerados).
--   2) O checklist novo do INSPETOR recebe o proximo numero do ano e o ano de
--      `criado_em` em Sao Paulo.
--   3) O seguinte recebe o numero seguinte.
--   4) Numero mandado pelo cliente no INSERT e ignorado.
--   5) Excluir o ultimo checklist nao devolve o numero dele ao contador.
--   6) Checklist feito em 31/12 (criado_em do aparelho) fica no ano dele, com
--      numeracao propria.
--   7) `authenticated` nao le o contador.
--   8) (ano, numero) e unico.
-- ============================================================================

begin;

select plan(8);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values ('f0000000-0000-0000-0000-000000000741', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'num.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0000000-0000-0000-0000-000000000741';

insert into public.grupos_sites (nome) values ('Grupo Numero Checklist');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Numero Checklist' from public.grupos_sites where nome = 'Grupo Numero Checklist';

-- Ponto de partida do contador neste ano (vazio numa base nova).
insert into ids_teste (chave, valor)
  select 'antes', coalesce(
    (select ultimo from manutencao.contador_de_checklists
      where ano = extract(year from now() at time zone 'America/Sao_Paulo')::smallint), 0);

-- 1) -------------------------------------------------------------------------
select is(
  (select count(*)::int from public.checklists_visita where numero is null or ano is null),
  0,
  'Nenhum checklist fica sem numero e ano'
);

-- 2) e 3) ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000741", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select chave, s.id, 'f0000000-0000-0000-0000-000000000741'
    from public.sites s
   cross join (values ('num-0741-a'), ('num-0741-b'), ('num-0741-c'), ('num-0741-d'), ('num-0741-e')) as k(chave)
   where s.nome = 'Site Numero Checklist';

insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
    from public.visitas v where v.numero_coleta = 'num-0741-a';

insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
    from public.visitas v where v.numero_coleta = 'num-0741-b';

reset role;

select is(
  (select c.numero::bigint || '/' || c.ano
     from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-a'),
  ((select valor from ids_teste where chave = 'antes') + 1)::bigint || '/'
    || extract(year from now() at time zone 'America/Sao_Paulo')::int,
  'Checklist novo recebe o proximo numero do ano'
);

select is(
  (select c.numero from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-b')
  - (select c.numero from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-a'),
  1,
  'O checklist seguinte recebe o numero seguinte'
);

-- 4) -------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000741", "role": "authenticated"}';

insert into public.checklists_visita (visita_id, tipo, assinatura_path, numero, ano)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png', 999999, 1999
    from public.visitas v where v.numero_coleta = 'num-0741-c';

reset role;

select is(
  (select c.numero from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-c'),
  (select c.numero + 1 from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-b'),
  'Numero mandado pelo cliente e ignorado'
);

-- 5) -------------------------------------------------------------------------
insert into ids_teste (chave, valor)
  select 'apagado', c.numero from public.checklists_visita c join public.visitas v on v.id = c.visita_id
   where v.numero_coleta = 'num-0741-c';

delete from public.checklists_visita c using public.visitas v
 where v.id = c.visita_id and v.numero_coleta = 'num-0741-c';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000741", "role": "authenticated"}';

insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
    from public.visitas v where v.numero_coleta = 'num-0741-d';

-- 6) feito no aparelho em 31/12/2021 as 23h30 de Sao Paulo (02h30 UTC de 01/01).
insert into public.checklists_visita (visita_id, tipo, assinatura_path, criado_em)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png', '2021-12-31 23:30:00-03'
    from public.visitas v where v.numero_coleta = 'num-0741-e';

reset role;

select is(
  (select c.numero from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-d'),
  ((select valor from ids_teste where chave = 'apagado') + 1)::int,
  'Excluir o ultimo checklist nao devolve o numero dele'
);

select is(
  (select c.numero || '/' || c.ano from public.checklists_visita c join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 'num-0741-e'),
  '1/2021',
  'Checklist de 31/12 fica no ano em que foi feito, com numeracao propria'
);

-- 7) -------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000741", "role": "authenticated"}';

select throws_ok(
  'select ultimo from manutencao.contador_de_checklists',
  '42501',
  null,
  'authenticated nao le o contador de checklists'
);

reset role;

-- 8) -------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.checklists_visita'::regclass
       and conname = 'checklists_visita_numero_por_ano'
       and contype = 'u'
  ),
  '(ano, numero) e unico'
);

select * from finish();

rollback;
