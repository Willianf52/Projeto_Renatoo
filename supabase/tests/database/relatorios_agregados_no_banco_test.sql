-- ============================================================================
-- pgTAP -- relatorios de Inspecoes agregados no banco (migration 0049)
--
-- Os casos abaixo sao os de `queries.test.ts` de cada tela, trazidos para o
-- lugar onde a regra agora mora. Cada visita da fixture existe para UMA regra:
--
--   V1  A, S1  Inicio 10/03 09:00, Termino 09:30 (evento, observacao e
--              localizacao so no Termino)       -> par valido, 30 min
--   V2  A, S1  Inicio 10/03 14:00 (checkpoint), Termino 14:45 -> 45 min
--   V3  A, S1  so Inicio 11/03                  -> conta visita, sem duracao
--   V4  B, S2  Inicio 31/03 23:30, Termino 01/04 00:10 -> Termino fora do
--              periodo: conta visita, sem duracao
--   V5  B, S2  Inicio 15/03 01:30 UTC (14/03 22:30 em -03), Termino 30 min
--              depois                           -> o dia e o de Brasilia
--   V6  A, S1  Termino ANTES do Inicio           -> sem duracao
--   V7  B, S1  unica leitura exatamente no fim do periodo -> fora
--
-- Periodo: marco de 2026 no fuso da operacao, [01/03 00:00-03, 01/04 00:00-03).
-- ============================================================================

begin;

select plan(25);

-- ---------------------------------------------------------------------------
-- Fixture (como postgres: ignora RLS so para montar o cenario)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email) values
  ('e0490000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.0049@teste.local'),
  ('e0490000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b.0049@teste.local'),
  ('e0490000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0049@teste.local'),
  ('e0490000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.0049@teste.local');

update public.profiles set ativo = true where id::text like 'e0490000%';
update public.profiles set cargo = 'INSPETOR', nome_completo = 'Inspetor A' where id = 'e0490000-0000-0000-0000-00000000000a';
update public.profiles set cargo = 'INSPETOR', nome_completo = 'Inspetor B' where id = 'e0490000-0000-0000-0000-00000000000b';
update public.profiles set cargo = 'GESTOR' where id = 'e0490000-0000-0000-0000-0000000000c0';
update public.profiles set cargo = 'CLIENTE' where id = 'e0490000-0000-0000-0000-0000000000c1';

insert into public.grupos_sites (nome) values ('Grupo TAP 0049');
insert into public.sites (grupo_site_id, nome, regional)
select g.id, v.nome, 'Regional TAP'
from public.grupos_sites g, (values ('Site TAP 0049 S1'), ('Site TAP 0049 S2')) as v(nome)
where g.nome = 'Grupo TAP 0049';

insert into public.eventos (nome) values ('Evento TAP 0049');
insert into public.qr_codes (codigo, site_id)
select 'QR-TAP-0049', id from public.sites where nome = 'Site TAP 0049 S1';

-- Visitas: `numero_coleta` e o rotulo da regra, para ler o cenario pelo nome.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
select v.rotulo, s.id, v.funcionario::uuid
from (values
  ('V1', 'Site TAP 0049 S1', 'e0490000-0000-0000-0000-00000000000a'),
  ('V2', 'Site TAP 0049 S1', 'e0490000-0000-0000-0000-00000000000a'),
  ('V3', 'Site TAP 0049 S1', 'e0490000-0000-0000-0000-00000000000a'),
  ('V4', 'Site TAP 0049 S2', 'e0490000-0000-0000-0000-00000000000b'),
  ('V5', 'Site TAP 0049 S2', 'e0490000-0000-0000-0000-00000000000b'),
  ('V6', 'Site TAP 0049 S1', 'e0490000-0000-0000-0000-00000000000a'),
  ('V7', 'Site TAP 0049 S1', 'e0490000-0000-0000-0000-00000000000b')
) as v(rotulo, site, funcionario)
join public.sites s on s.nome = v.site;

insert into public.leituras (visita_id, data_hora, area_id, evento_id, qr_code_id, observacao, tem_localizacao)
select vi.id, l.data_hora::timestamptz, a.id, e.id, q.id, l.observacao, l.localizacao
from (values
  ('V1', '2026-03-10 09:00:00-03', 'Início',  false, false, ' ',     false),
  ('V1', '2026-03-10 09:30:00-03', 'Término', true,  false, 'porta', true),
  ('V2', '2026-03-10 14:00:00-03', 'Início',  false, true,  null,    false),
  ('V2', '2026-03-10 14:45:00-03', 'Término', false, false, null,    false),
  ('V3', '2026-03-11 10:00:00-03', 'Início',  false, false, null,    false),
  ('V4', '2026-03-31 23:30:00-03', 'Início',  false, false, null,    false),
  ('V4', '2026-04-01 00:10:00-03', 'Término', false, false, null,    false),
  ('V5', '2026-03-15 01:30:00+00', 'Início',  false, false, null,    false),
  ('V5', '2026-03-15 02:00:00+00', 'Término', false, false, null,    false),
  ('V6', '2026-03-20 10:00:00-03', 'Início',  false, false, null,    false),
  ('V6', '2026-03-20 09:00:00-03', 'Término', false, false, null,    false),
  ('V7', '2026-04-01 00:00:00-03', 'Início',  false, false, null,    false)
) as l(rotulo, data_hora, area, com_evento, com_checkpoint, observacao, localizacao)
join public.visitas vi on vi.numero_coleta = l.rotulo
join public.areas a on a.nome = l.area
left join public.eventos e on l.com_evento and e.nome = 'Evento TAP 0049'
left join public.qr_codes q on l.com_checkpoint and q.codigo = 'QR-TAP-0049';

-- Os filtros chegam como texto na URL; aqui, montados a partir dos ids reais.
create temp table ids on commit drop as
select
  (select id from public.sites where nome = 'Site TAP 0049 S1') as s1,
  (select id from public.sites where nome = 'Site TAP 0049 S2') as s2,
  (select id from public.eventos where nome = 'Evento TAP 0049') as evento,
  (select id from public.qr_codes where codigo = 'QR-TAP-0049') as checkpoint;
grant select on ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Como GESTOR: ve a operacao inteira
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0490000-0000-0000-0000-0000000000c0", "role": "authenticated"}';

-- 1) visitas_do_periodo: recorte e filtros --------------------------------------

select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where visita_id in (select id from public.visitas where numero_coleta like 'V_')),
  6,
  'uma linha por visita com leitura no periodo; V7 (leitura exatamente no fim) fica fora'
);

select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('evento', (select evento from ids)))),
  1,
  'filtro de evento pega a visita cujo evento esta no TERMINO, nao so no Inicio'
);

select is(
  (select v.numero_coleta from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('checkpoint', (select checkpoint from ids))) p
   join public.visitas v on v.id = p.visita_id),
  'V2',
  'filtro de checkpoint mantem a visita inteira (Inicio e Termino), nao so a leitura'
);

select is(
  (select termino is not null from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('checkpoint', (select checkpoint from ids)))),
  true,
  'com filtro de detalhe, o Termino da visita continua disponivel para a duracao'
);

-- Evento esta no Termino de V1; checkpoint no Inicio de V2. Nenhuma leitura
-- isolada tem os dois -- e "a visita teve os dois em leituras diferentes" nao
-- basta, mesma regra de `combinaFiltrosDeDetalhe`.
select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('evento', (select evento from ids), 'checkpoint', (select checkpoint from ids)))),
  0,
  'dois filtros de detalhe exigem a MESMA leitura batendo com os dois'
);

select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('site', (select s2 from ids)))),
  2,
  'filtro de site recorta por visita (V4 e V5)'
);

select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('funcionario', 'e0490000-0000-0000-0000-00000000000a'))),
  4,
  'filtro de funcionario recorta por visita (V1, V2, V3, V6)'
);

select throws_ok(
  $$ select * from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03', '{"site": "abc"}') $$,
  '22P02', null,
  'filtro que nao converte levanta erro, em vez de ser ignorado em silencio'
);

-- 2) Registro de Rondas ---------------------------------------------------------

select is(
  (select duracoes_ms from public.relatorio_registro_de_rondas('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s1 from ids) and dia = 10),
  array[1800000, 2700000]::bigint[],
  'rondas do mesmo Local no mesmo dia: duas duracoes, em ordem de inicio'
);

select is(
  (select count(*)::int from public.relatorio_registro_de_rondas('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id in (select s1 from ids union select s2 from ids)),
  2,
  'so V1+V2 (S1, dia 10) e V5 (S2) tem duracao; V3, V4 e V6 nao entram'
);

select is(
  (select dia from public.relatorio_registro_de_rondas('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s2 from ids)),
  14::smallint,
  'o dia da ronda e o de Brasilia: 15/03 01:30 UTC cai no dia 14'
);

-- 3) Horas por Usuario -------------------------------------------------------------

select results_eq(
  $$ select total_ms, visitas from public.relatorio_horas_por_usuario('2026-03-01 00:00-03', '2026-04-01 00:00-03')
      where funcionario_id = 'e0490000-0000-0000-0000-00000000000a' $$,
  $$ values (4500000::bigint, 2) $$,
  'A soma 30 + 45 min em 2 visitas; V3 (sem Termino) e V6 (Termino antes) nao contam'
);

select results_eq(
  $$ select total_ms, visitas from public.relatorio_horas_por_usuario('2026-03-01 00:00-03', '2026-04-01 00:00-03')
      where funcionario_id = 'e0490000-0000-0000-0000-00000000000b' $$,
  $$ values (1800000::bigint, 1) $$,
  'B soma so V5; V4 teve o Termino fora do periodo'
);

-- 4) Ranking de Inspecoes ------------------------------------------------------------

select results_eq(
  $$ select nome, quantidade from public.relatorio_ranking_de_inspecoes('2026-03-01 00:00-03', '2026-04-01 00:00-03')
      where funcionario_id::text like 'e0490000%' order by nome $$,
  $$ values ('Inspetor A'::text, 4), ('Inspetor B'::text, 2) $$,
  'ranking conta visita com qualquer leitura no periodo, com ou sem par Inicio/Termino'
);

select is(
  (select quantidade from public.relatorio_ranking_de_inspecoes('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     jsonb_build_object('checkpoint', (select checkpoint from ids)))
    where funcionario_id = 'e0490000-0000-0000-0000-00000000000a'),
  1,
  'ranking com checkpoint conta a visita uma vez, nao uma por leitura'
);

-- 5) Mapa de Locais Inspecionados ------------------------------------------------------

select is(
  (select quantidade from public.relatorio_mapa_de_locais('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s1 from ids) and dia = '2026-03-10'),
  2,
  'Local x dia conta visitas distintas (V1 e V2), nao leituras (quatro)'
);

select is(
  (select quantidade from public.relatorio_mapa_de_locais('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s2 from ids) and dia = '2026-03-14'),
  1,
  'o dia do mapa e o de Brasilia (V5 no dia 14, nao 15)'
);

select is(
  (select sum(quantidade)::int from public.relatorio_mapa_de_locais('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s1 from ids)),
  4,
  'cada visita conta em um dia so: o total de S1 e 4 (V1, V2, V3, V6)'
);

-- 6) Inspecoes com Inicio e Fim ----------------------------------------------------------

select is(
  (select count(*)::int from public.relatorio_inspecoes_inicio_fim('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site in ('Site TAP 0049 S1', 'Site TAP 0049 S2')),
  3,
  'uma linha por visita com par valido: V1, V2 e V5'
);

select results_eq(
  $$ select duracao_ms, usuario, regional, evento
       from public.relatorio_inspecoes_inicio_fim('2026-03-01 00:00-03', '2026-04-01 00:00-03')
      where inicio = '2026-03-10 09:00:00-03' and site = 'Site TAP 0049 S1' $$,
  $$ values (1800000::bigint, 'Inspetor A'::text, 'Regional TAP'::text, 'Evento TAP 0049'::text) $$,
  'o evento da visita vem da leitura que o tem (o Termino), nao so do Inicio'
);

-- 7) Visitas de Supervisao ------------------------------------------------------------------

select is(
  (select count(*)::int from public.relatorio_visitas_de_supervisao((select s1 from ids), '2026-03-01 00:00-03', '2026-04-01 00:00-03')),
  4,
  'supervisao lista toda visita do site no periodo, com ou sem par'
);

select results_eq(
  $$ select data_hora, tem_localizacao, observacao
       from public.relatorio_visitas_de_supervisao((select s1 from ids), '2026-03-01 00:00-03', '2026-04-01 00:00-03')
      where data_hora = '2026-03-10 09:00:00-03' $$,
  $$ values ('2026-03-10 09:00:00-03'::timestamptz, true, 'porta'::text) $$,
  'data e a da leitura mais antiga; localizacao e observacao vem de qualquer leitura (a do Inicio era so espaco)'
);

-- ---------------------------------------------------------------------------
-- RLS: SECURITY INVOKER mantem o recorte de quem chama
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" to '{"sub": "e0490000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where visita_id in (select id from public.visitas where numero_coleta like 'V_')),
  0,
  'CLIENTE sem escopo nao ve visita nenhuma: a funcao nao contorna o RLS (0014)'
);

set local "request.jwt.claims" to '{"sub": "e0490000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is(
  (select sum(quantidade)::int from public.relatorio_ranking_de_inspecoes('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where funcionario_id::text like 'e0490000%'),
  2,
  'INSPETOR B so enxerga as proprias visitas (V4 e V5), nao as de A'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.visitas_do_periodo('2026-03-01 00:00-03', '2026-04-01 00:00-03') $$,
  '42501', null,
  'anon nao executa visitas_do_periodo (regra da 0027)'
);

reset role;

select * from finish();

rollback;
