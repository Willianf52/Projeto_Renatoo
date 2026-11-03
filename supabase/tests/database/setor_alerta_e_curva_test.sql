-- ============================================================================
-- pgTAP -- Setor, Alerta de Panico, Tipo de Curva e a leitura do Cliente (0086)
--
--   1) O GESTOR cadastra setor; o INSPETOR le a lista mas nao cadastra.
--   2) salvar_evento grava o Setor Responsavel de `p_extras`.
--   3) O INSPETOR le o cadastro do Cliente (os minimos do app), sem editar.
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000861', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'set.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000862', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'set.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000861';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000862';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000861", "role": "authenticated"}';

insert into public.setores (nome, cor) values ('Operacional 0086', '#112233');
insert into public.tipos_curva (nome) values ('Curva A 0086');
insert into public.tipos_alerta_panico (nome) values ('Botao 0086');
insert into ids_teste (chave, valor) select 'setor', id from public.setores where nome = 'Operacional 0086';

insert into ids_teste (chave, valor)
select 'evento', public.salvar_evento(
  null, 'Evento 0086', null, null, null, null, true, '{}', '{}',
  jsonb_build_object('setor_responsavel_id', (select valor from ids_teste where chave = 'setor')));

select is(
  (select setor_responsavel_id from public.eventos where id = (select valor from ids_teste where chave = 'evento')),
  (select valor from ids_teste where chave = 'setor'),
  'salvar_evento grava o Setor Responsavel'
);

select is(
  (select count(*)::int from public.tipos_curva where nome = 'Curva A 0086')
    + (select count(*)::int from public.tipos_alerta_panico where nome = 'Botao 0086'),
  2,
  'o GESTOR cadastra tipo de curva e tipo de alerta de panico'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000862", "role": "authenticated"}';

select is(
  (select count(*)::int from public.setores where nome = 'Operacional 0086'),
  1,
  'o INSPETOR le a lista de setores'
);

select throws_ok(
  $$ insert into public.setores (nome) values ('Inspetor 0086') $$,
  '42501', null,
  'o INSPETOR nao cadastra setor'
);

select is((select count(*)::int from public.cliente), 1, 'o INSPETOR le o cadastro do Cliente');

update public.cliente set min_caracteres_descricao = 999;

reset role;

select is(
  (select min_caracteres_descricao from public.cliente),
  0,
  'a edicao do INSPETOR no Cliente nao muda nada'
);

select * from finish();
rollback;
