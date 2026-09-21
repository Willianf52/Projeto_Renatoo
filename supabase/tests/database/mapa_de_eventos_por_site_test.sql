-- ============================================================================
-- pgTAP -- Mapa de Eventos por Site (migration 0057)
--
-- Periodo: 01/03 a 31/03/2026 no fuso da operacao.
--
--   '571'  A, S1  10/03 09:00 e 10:00        -> S1/10 = 2
--          "      14/03 22:30 -03 (01:30 UTC de 15/03) -> S1/14, nao 15
--   '572'  B, S2  12/03, evento B            -> S2/12 = 1
--          "      01/04 00:00 (fim exato)    -> fora
-- ============================================================================

begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e0570000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.0057@teste.local'),
  ('e0570000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b.0057@teste.local'),
  ('e0570000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0057@teste.local'),
  ('e0570000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.0057@teste.local');

update public.profiles set ativo = true where id::text like 'e0570000%';
update public.profiles set cargo = 'INSPETOR' where id in ('e0570000-0000-0000-0000-00000000000a', 'e0570000-0000-0000-0000-00000000000b');
update public.profiles set cargo = 'GESTOR' where id = 'e0570000-0000-0000-0000-0000000000c0';
update public.profiles set cargo = 'CLIENTE' where id = 'e0570000-0000-0000-0000-0000000000c1';

insert into public.grupos_sites (nome) values ('Grupo TAP 0057');
insert into public.sites (grupo_site_id, nome, regional)
select g.id, v.nome, 'Regional TAP'
from public.grupos_sites g, (values ('Site TAP 0057 S1'), ('Site TAP 0057 S2')) as v(nome)
where g.nome = 'Grupo TAP 0057';

insert into public.eventos (nome) values ('Evento TAP 0057 A'), ('Evento TAP 0057 B');

-- Rotulos como texto: `visitas.numero_coleta` e text desde a 0047.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
select v.rotulo, s.id, v.funcionario::uuid
from (values
  ('571', 'Site TAP 0057 S1', 'e0570000-0000-0000-0000-00000000000a'),
  ('572', 'Site TAP 0057 S2', 'e0570000-0000-0000-0000-00000000000b')
) as v(rotulo, site, funcionario)
join public.sites s on s.nome = v.site;

insert into public.leituras (visita_id, data_hora, evento_id)
select vi.id, l.data_hora::timestamptz, e.id
from (values
  ('571', '2026-03-10 09:00:00-03', 'Evento TAP 0057 A'),
  ('571', '2026-03-10 10:00:00-03', 'Evento TAP 0057 A'),
  ('571', '2026-03-15 01:30:00+00', 'Evento TAP 0057 A'),
  ('572', '2026-03-12 08:00:00-03', 'Evento TAP 0057 B'),
  ('572', '2026-04-01 00:00:00-03', 'Evento TAP 0057 B')
) as l(rotulo, data_hora, evento)
join public.visitas vi on vi.numero_coleta = l.rotulo
join public.eventos e on e.nome = l.evento;

create temp table ids on commit drop as
select
  (select id from public.sites where nome = 'Site TAP 0057 S1') as s1,
  (select id from public.sites where nome = 'Site TAP 0057 S2') as s2,
  (select id from public.eventos where nome = 'Evento TAP 0057 B') as evento_b;
grant select on ids to authenticated, anon;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0570000-0000-0000-0000-0000000000c0", "role": "authenticated"}';

select results_eq(
  $q$ select site_id, dia, quantidade
        from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03')
       where site_id in ((select s1 from ids), (select s2 from ids))
       order by site_id, dia $q$,
  $q$ values
        ((select s1 from ids), '2026-03-10'::date, 2),
        ((select s1 from ids), '2026-03-14'::date, 1),
        ((select s2 from ids), '2026-03-12'::date, 1) $q$,
  'ocorrencias por site x dia; o fim exato do periodo fica de fora'
);

select is(
  (select count(*)::int from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s1 from ids) and dia = '2026-03-15'),
  0,
  'o dia e o de Brasilia: 01:30 UTC de 15/03 conta no dia 14'
);

select is(
  (select sum(quantidade)::int from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('evento', (select evento_b from ids)))),
  1,
  'filtro de evento'
);

select is(
  (select sum(quantidade)::int from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('funcionario', 'e0570000-0000-0000-0000-00000000000a'))),
  3,
  'filtro de funcionario recorta pelo dono da visita'
);

set local "request.jwt.claims" to '{"sub": "e0570000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id in ((select s1 from ids), (select s2 from ids))),
  0,
  'CLIENTE sem escopo nao ve evento nenhum: a funcao nao contorna o RLS (0014)'
);

reset role;
set local role anon;

select throws_ok(
  $q$ select * from public.relatorio_mapa_de_eventos_por_site('2026-03-01 00:00-03', '2026-04-01 00:00-03') $q$,
  '42501', null,
  'anon nao executa relatorio_mapa_de_eventos_por_site'
);

reset role;

select * from finish();

rollback;
