-- ============================================================================
-- pgTAP — Visitas de Supervisao com a coordenada da leitura (migration 0101)
--
--   1) A visita traz a coordenada da leitura mais antiga que a tem.
--   2) Visita sem coordenada volta com latitude e longitude nulas.
--   3) O relatorio continua com uma linha por visita.
--   4) A funcao devolve as colunas de antes mais latitude e longitude.
--   5) anon nao executa; authenticated executa.
-- ============================================================================

begin;

select plan(5);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f1010000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm101.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR', nome_completo = 'Inspetor 0101'
  where id = 'f1010000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo 0101');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site 0101' from public.grupos_sites where nome = 'Grupo 0101';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select v.chave, s.id, 'f1010000-0000-0000-0000-000000000001'
    from public.sites s, (values ('0101-com'), ('0101-sem')) as v(chave)
   where s.nome = 'Site 0101';

-- Visita com coordenada: a primeira leitura nao tem, a segunda tem, a terceira
-- tem outra. Vale a segunda (a mais antiga que a tem).
insert into public.leituras (visita_id, data_hora, latitude, longitude)
  select v.id, x.quando, x.lat, x.lng
    from public.visitas v,
         (values (now() - interval '3 minutes', null::double precision, null::double precision),
                 (now() - interval '2 minutes', -23.2780986::double precision, -47.6717::double precision),
                 (now() - interval '1 minute',  -23.5::double precision, -47.0::double precision)) as x(quando, lat, lng)
   where v.numero_coleta = '0101-com';

insert into public.leituras (visita_id, data_hora)
  select v.id, now() from public.visitas v where v.numero_coleta = '0101-sem';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f1010000-0000-0000-0000-000000000001", "role": "authenticated"}';

select results_eq(
  $$ select r.latitude, r.longitude
       from public.relatorio_visitas_de_supervisao(
              (select id from public.sites where nome = 'Site 0101'), now() - interval '1 day', now() + interval '1 day') r
       join public.visitas v on v.id = r.visita_id
      where v.numero_coleta = '0101-com' $$,
  $$ values (-23.2780986::double precision, -47.6717::double precision) $$,
  'a visita traz a coordenada da leitura mais antiga que a tem'
);

select results_eq(
  $$ select r.latitude is null and r.longitude is null
       from public.relatorio_visitas_de_supervisao(
              (select id from public.sites where nome = 'Site 0101'), now() - interval '1 day', now() + interval '1 day') r
       join public.visitas v on v.id = r.visita_id
      where v.numero_coleta = '0101-sem' $$,
  $$ values (true) $$,
  'visita sem coordenada volta com latitude e longitude nulas'
);

select is(
  (select count(*)::int
     from public.relatorio_visitas_de_supervisao(
            (select id from public.sites where nome = 'Site 0101'), now() - interval '1 day', now() + interval '1 day')),
  2,
  'o relatorio continua devolvendo uma linha por visita'
);

reset role;

select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
     from information_schema.parameters
    where specific_name = (select specific_name from information_schema.routines
                            where routine_schema = 'public' and routine_name = 'relatorio_visitas_de_supervisao')
      and parameter_mode = 'OUT'),
  'visita_id,data_hora,funcionario,local,tem_localizacao,motivo_visita,observacao,latitude,longitude',
  'a funcao devolve as colunas de antes mais latitude e longitude'
);

select ok(
  not has_function_privilege('anon', 'public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.relatorio_visitas_de_supervisao(bigint, timestamptz, timestamptz)', 'execute'),
  'anon nao executa; authenticated executa'
);

select * from finish();
rollback;
