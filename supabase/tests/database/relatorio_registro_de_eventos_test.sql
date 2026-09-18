-- ============================================================================
-- pgTAP -- Registro de Eventos (migration 0055)
--
-- Cada leitura da fixture existe para UMA regra. Periodo de todos os casos:
-- marco de 2026 no fuso da operacao, [01/03 00:00-03, 01/04 00:00-03).
--
--   551  A, S1  09:00 e 09:30 de 10/03, evento A, inseridas em 10/03
--               -> duas OCORRENCIAS na mesma visita, nao uma
--        "      10:00 de 10/03, evento A, SEM data de insercao
--               -> entra por data do evento, sai por data de insercao
--        "      09:00 de 11/03, SEM evento -> nunca entra
--   552  A, S1  12/03, evento B, inserida em 02/04
--               -> entra por data do evento, sai por data de insercao
--   553  B, S2  15/03, evento A, inserida em 15/03 -> entra nos dois modos
--        "      01/04 00:00 (o fim exato do periodo), evento B, inserida em
--               20/03 -> sai por data do evento, entra por data de insercao
--
--   por data do evento:   S1/A = 3, S1/B = 1, S2/A = 1          (soma 5)
--   por data de insercao: S1/A = 2, S2/A = 1, S2/B = 1          (soma 4)
-- ============================================================================

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixture (como postgres: ignora RLS so para montar o cenario)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email) values
  ('e0550000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a.0055@teste.local'),
  ('e0550000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b.0055@teste.local'),
  ('e0550000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0055@teste.local'),
  ('e0550000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.0055@teste.local');

update public.profiles set ativo = true where id::text like 'e0550000%';
update public.profiles set cargo = 'INSPETOR', nome_completo = 'Inspetor A 0055' where id = 'e0550000-0000-0000-0000-00000000000a';
update public.profiles set cargo = 'INSPETOR', nome_completo = 'Inspetor B 0055' where id = 'e0550000-0000-0000-0000-00000000000b';
update public.profiles set cargo = 'GESTOR' where id = 'e0550000-0000-0000-0000-0000000000c0';
update public.profiles set cargo = 'CLIENTE' where id = 'e0550000-0000-0000-0000-0000000000c1';

insert into public.grupos_sites (nome) values ('Grupo TAP 0055');
insert into public.sites (grupo_site_id, nome, regional)
select g.id, v.nome, 'Regional TAP'
from public.grupos_sites g, (values ('Site TAP 0055 S1'), ('Site TAP 0055 S2')) as v(nome)
where g.nome = 'Grupo TAP 0055';

insert into public.eventos (nome) values ('Evento TAP 0055 A'), ('Evento TAP 0055 B');

insert into public.grupos_usuarios (nome) values ('Grupo Usuarios TAP 0055');
insert into public.grupos_usuarios_membros (grupo_id, profile_id)
select g.id, 'e0550000-0000-0000-0000-00000000000a'
from public.grupos_usuarios g where g.nome = 'Grupo Usuarios TAP 0055';

-- `numero_coleta` e o rotulo da regra, para ler o cenario pelo nome.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
select v.rotulo, s.id, v.funcionario::uuid
from (values
  (551, 'Site TAP 0055 S1', 'e0550000-0000-0000-0000-00000000000a'),
  (552, 'Site TAP 0055 S1', 'e0550000-0000-0000-0000-00000000000a'),
  (553, 'Site TAP 0055 S2', 'e0550000-0000-0000-0000-00000000000b')
) as v(rotulo, site, funcionario)
join public.sites s on s.nome = v.site;

insert into public.leituras (visita_id, data_hora, data_integracao, evento_id)
select vi.id, l.data_hora::timestamptz, l.data_integracao::timestamptz, e.id
from (values
  (551, '2026-03-10 09:00:00-03', '2026-03-10 20:00:00-03', 'Evento TAP 0055 A'),
  (551, '2026-03-10 09:30:00-03', '2026-03-10 20:00:00-03', 'Evento TAP 0055 A'),
  (551, '2026-03-10 10:00:00-03', null,                     'Evento TAP 0055 A'),
  (551, '2026-03-11 09:00:00-03', '2026-03-11 20:00:00-03', null),
  (552, '2026-03-12 08:00:00-03', '2026-04-02 10:00:00-03', 'Evento TAP 0055 B'),
  (553, '2026-03-15 07:00:00-03', '2026-03-15 21:00:00-03', 'Evento TAP 0055 A'),
  (553, '2026-04-01 00:00:00-03', '2026-03-20 10:00:00-03', 'Evento TAP 0055 B')
) as l(rotulo, data_hora, data_integracao, evento)
join public.visitas vi on vi.numero_coleta = l.rotulo
left join public.eventos e on e.nome = l.evento;

-- Os filtros chegam como texto na URL; aqui, montados a partir dos ids reais.
create temp table ids on commit drop as
select
  (select id from public.sites where nome = 'Site TAP 0055 S1') as s1,
  (select id from public.sites where nome = 'Site TAP 0055 S2') as s2,
  (select id from public.eventos where nome = 'Evento TAP 0055 A') as evento_a,
  (select id from public.eventos where nome = 'Evento TAP 0055 B') as evento_b,
  (select id from public.grupos_usuarios where nome = 'Grupo Usuarios TAP 0055') as grupo_usuario;
grant select on ids to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Como GESTOR: ve a operacao inteira
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0550000-0000-0000-0000-0000000000c0", "role": "authenticated"}';

-- 1) Recorte por DATA DO EVENTO ---------------------------------------------

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0055%'),
  3,
  'tres linhas Site x Evento no periodo (S1/A, S1/B, S2/A)'
);

select is(
  (select quantidade from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s1 from ids) and evento_id = (select evento_a from ids)),
  3,
  'conta OCORRENCIAS, nao visitas: tres leituras do mesmo evento na mesma visita valem tres'
);

select is(
  (select sum(quantidade)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0055%'),
  5,
  'leitura sem evento nao entra na contagem'
);

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where site_id = (select s2 from ids) and evento_id = (select evento_b from ids)),
  0,
  'periodo meio-aberto: leitura exatamente em p_fim fica de fora'
);

select results_eq(
  $q$ select site_nome, grupo_site_nome, evento_nome, quantidade
        from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
       where evento_nome = 'Evento TAP 0055 B' $q$,
  $q$ values ('Site TAP 0055 S1'::text, 'Grupo TAP 0055'::text, 'Evento TAP 0055 B'::text, 1) $q$,
  'a linha ja vem com os nomes de site, grupo e evento resolvidos'
);

-- 2) Recorte por DATA DE INSERCAO -------------------------------------------

select is(
  (select sum(quantidade)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03', true)
    where evento_nome like 'Evento TAP 0055%'),
  4,
  'por data de insercao o total muda: entra a leitura inserida em 20/03, sai a inserida em 02/04'
);

select is(
  (select quantidade from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03', true)
    where site_id = (select s1 from ids) and evento_id = (select evento_a from ids)),
  2,
  'leitura sem data de insercao fica fora do recorte por insercao'
);

select is(
  (select quantidade from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03', true)
    where site_id = (select s2 from ids) and evento_id = (select evento_b from ids)),
  1,
  'leitura com data do evento fora e insercao dentro entra so no modo insercao'
);

-- 3) Filtros -----------------------------------------------------------------

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     false, jsonb_build_object('evento', (select evento_a from ids)))),
  2,
  'filtro de evento deixa so as linhas do evento A (S1 e S2)'
);

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     false, jsonb_build_object('site', (select s1 from ids)))),
  2,
  'filtro de site deixa so as linhas de S1'
);

select is(
  (select site_id from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     false, jsonb_build_object('funcionario', 'e0550000-0000-0000-0000-00000000000b'))),
  (select s2 from ids),
  'filtro de funcionario recorta pelo dono da visita'
);

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03',
     false, jsonb_build_object('grupo_usuario', (select grupo_usuario from ids)))),
  2,
  'filtro de grupo de usuarios pega as visitas de quem e membro (so o Inspetor A)'
);

-- ---------------------------------------------------------------------------
-- RLS: SECURITY INVOKER mantem o recorte de quem chama
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" to '{"sub": "e0550000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

select is(
  (select count(*)::int from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03')
    where evento_nome like 'Evento TAP 0055%'),
  0,
  'CLIENTE sem escopo nao ve evento nenhum: a funcao nao contorna o RLS (0014)'
);

reset role;
set local role anon;

select throws_ok(
  $q$ select * from public.relatorio_registro_de_eventos('2026-03-01 00:00-03', '2026-04-01 00:00-03') $q$,
  '42501', null,
  'anon nao executa relatorio_registro_de_eventos (regra da 0027)'
);

reset role;

select * from finish();

rollback;
