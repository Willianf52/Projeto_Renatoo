-- ============================================================================
-- pgTAP -- Mapa de Eventos e a base `ocorrencias_de_evento` (migration 0056)
--
-- Periodo: marco de 2026 no fuso da operacao, [01/03 00:00-03, 01/04 00:00-03).
--
--   561  A, S1  10/03 09:00 e 10:00, evento A          -> dia 10 vale 2
--        "      10/03 11:00, evento B, atividade X     -> so o filtro de atividade
--   562  B, S2  14/03 22:30 -03 (15/03 01:30 UTC), A   -> dia 14, nao 15
--        "      01/04 00:00 (o fim exato), evento A    -> fora
--        "      12/03, SEM evento                      -> nunca entra
--
--   Mapa: A/10 = 2, B/10 = 1, A/14 = 1                  (soma 4)
-- ============================================================================

begin;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixture (como postgres: ignora RLS so para montar o cenario)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email) values
  ('e0560000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.0056@teste.local'),
  ('e0560000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b.0056@teste.local'),
  ('e0560000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0056@teste.local'),
  ('e0560000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.0056@teste.local');

update public.profiles set ativo = true where id::text like 'e0560000%';
update public.profiles set cargo = 'INSPETOR' where id in ('e0560000-0000-0000-0000-00000000000a', 'e0560000-0000-0000-0000-00000000000b');
update public.profiles set cargo = 'GESTOR' where id = 'e0560000-0000-0000-0000-0000000000c0';
update public.profiles set cargo = 'CLIENTE' where id = 'e0560000-0000-0000-0000-0000000000c1';

insert into public.grupos_sites (nome) values ('Grupo TAP 0056');
insert into public.sites (grupo_site_id, nome, regional)
select g.id, v.nome, 'Regional TAP'
from public.grupos_sites g, (values ('Site TAP 0056 S1'), ('Site TAP 0056 S2')) as v(nome)
where g.nome = 'Grupo TAP 0056';

insert into public.eventos (nome) values ('Evento TAP 0056 A'), ('Evento TAP 0056 B');
insert into public.acoes (nome) values ('Atividade TAP 0056 X');

insert into public.visitas (numero_coleta, site_id, funcionario_id)
select v.rotulo, s.id, v.funcionario::uuid
from (values
  (561, 'Site TAP 0056 S1', 'e0560000-0000-0000-0000-00000000000a'),
  (562, 'Site TAP 0056 S2', 'e0560000-0000-0000-0000-00000000000b')
) as v(rotulo, site, funcionario)
join public.sites s on s.nome = v.site;

insert into public.leituras (visita_id, data_hora, evento_id, acao_id)
select vi.id, l.data_hora::timestamptz, e.id, a.id
from (values
  (561, '2026-03-10 09:00:00-03', 'Evento TAP 0056 A', null),
  (561, '2026-03-10 10:00:00-03', 'Evento TAP 0056 A', null),
  (561, '2026-03-10 11:00:00-03', 'Evento TAP 0056 B', 'Atividade TAP 0056 X'),
  (562, '2026-03-15 01:30:00+00', 'Evento TAP 0056 A', null),
  (562, '2026-04-01 00:00:00-03', 'Evento TAP 0056 A', null),
  (562, '2026-03-12 08:00:00-03', null,                null)
) as l(rotulo, data_hora, evento, atividade)
join public.visitas vi on vi.numero_coleta = l.rotulo
left join public.eventos e on e.nome = l.evento
left join public.acoes a on a.nome = l.atividade;

create temp table ids on commit drop as
select
  (select id from public.eventos where nome = 'Evento TAP 0056 A') as evento_a,
  (select id from public.eventos where nome = 'Evento TAP 0056 B') as evento_b,
  (select id from public.acoes where nome = 'Atividade TAP 0056 X') as atividade_x;
grant select on ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Como GESTOR
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0560000-0000-0000-0000-0000000000c0", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencias_de_evento('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0056%'),
  4,
  'base: uma linha por leitura com evento no periodo (sem a do fim exato, sem a sem evento)'
);

select results_eq(
  $q$ select evento_nome, dia::int, quantidade
        from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
       where evento_nome like 'Evento TAP 0056%'
       order by evento_nome, dia $q$,
  $q$ values ('Evento TAP 0056 A'::text, 10, 2), ('Evento TAP 0056 A'::text, 14, 1), ('Evento TAP 0056 B'::text, 10, 1) $q$,
  'mapa: ocorrencias por evento x dia'
);

select is(
  (select count(*)::int from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_id = (select evento_a from ids) and dia = 15),
  0,
  'o dia e o de Brasilia: 01:30 UTC de 15/03 conta no dia 14'
);

select is(
  (select sum(quantidade)::int from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('evento', (select evento_a from ids)))),
  3,
  'filtro de evento'
);

select results_eq(
  $q$ select evento_nome, quantidade
        from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
          jsonb_build_object('atividade', (select atividade_x from ids))) $q$,
  $q$ values ('Evento TAP 0056 B'::text, 1) $q$,
  'filtro de atividade recorta pela leitura (acao_id)'
);

select is(
  (select sum(quantidade)::int from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('funcionario', 'e0560000-0000-0000-0000-00000000000b'))),
  1,
  'filtro de funcionario recorta pelo dono da visita'
);

-- A reescrita do Registro sobre a base nao muda a contagem.
select is(
  (select sum(quantidade)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0056%'),
  4,
  'registro de eventos, agora sobre a base, soma o mesmo que o mapa'
);

-- ---------------------------------------------------------------------------
-- RLS e grants
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" to '{"sub": "e0560000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0056%'),
  0,
  'CLIENTE sem escopo nao ve evento nenhum: a funcao nao contorna o RLS (0014)'
);

reset role;
set local role anon;

select throws_ok(
  $q$ select * from public.relatorio_mapa_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03') $q$,
  '42501', null,
  'anon nao executa relatorio_mapa_de_eventos'
);

select throws_ok(
  $q$ select * from public.ocorrencias_de_evento('2026-03-01 00:00-03', '2026-04-01 00:00-03') $q$,
  '42501', null,
  'anon nao executa ocorrencias_de_evento'
);

reset role;

select * from finish();

rollback;
