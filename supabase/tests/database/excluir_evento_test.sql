-- ============================================================================
-- pgTAP -- Excluir evento (migration 0094)
--
--   - o GESTOR exclui um evento sem historico;
--   - o evento com ocorrencia nao se exclui (23503);
--   - o evento com SubTipo nao se exclui (23503);
--   - o INSPETOR nao exclui (42501).
-- ============================================================================

begin;

select plan(5);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ee.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000942', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ee.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000941';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000942';

insert into public.grupos_sites (nome) values ('Grupo Excluir 0094');
insert into public.sites (grupo_site_id, nome) select id, 'Site Excluir 0094' from public.grupos_sites where nome = 'Grupo Excluir 0094';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Excluir 0094';

insert into public.eventos (nome) values ('Evento vazio 0094'), ('Evento com ocorrencia 0094'), ('Evento pai 0094');
insert into public.eventos (nome, superior_id)
  select 'Subtipo 0094', id from public.eventos where nome = 'Evento pai 0094';
insert into ids_teste (chave, valor) select 'vazio', id from public.eventos where nome = 'Evento vazio 0094';
insert into ids_teste (chave, valor) select 'com_oc', id from public.eventos where nome = 'Evento com ocorrencia 0094';
insert into ids_teste (chave, valor) select 'pai', id from public.eventos where nome = 'Evento pai 0094';

insert into public.ocorrencias (numero, ano, site_id, evento_id, origem, aberta_por)
values (99401, 2026, (select valor from ids_teste where chave = 'site'), (select valor from ids_teste where chave = 'com_oc'),
        'MANUAL', 'f0000000-0000-0000-0000-000000000941');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000942", "role": "authenticated"}';

select throws_ok(
  format('select public.excluir_evento(%s)', (select valor from ids_teste where chave = 'vazio')),
  '42501',
  null,
  'o INSPETOR nao exclui evento'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000941", "role": "authenticated"}';

select throws_ok(
  format('select public.excluir_evento(%s)', (select valor from ids_teste where chave = 'com_oc')),
  '23503',
  null,
  'evento com ocorrencia nao se exclui'
);

select throws_ok(
  format('select public.excluir_evento(%s)', (select valor from ids_teste where chave = 'pai')),
  '23503',
  null,
  'evento com SubTipo nao se exclui'
);

select lives_ok(
  format('select public.excluir_evento(%s)', (select valor from ids_teste where chave = 'vazio')),
  'o GESTOR exclui o evento sem historico'
);

reset role;

select is(
  (select count(*)::int from public.eventos where id = (select valor from ids_teste where chave = 'vazio')),
  0,
  'o evento excluido sumiu'
);

select * from finish();
rollback;
