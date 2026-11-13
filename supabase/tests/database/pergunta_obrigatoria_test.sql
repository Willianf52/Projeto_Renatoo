-- ============================================================================
-- pgTAP — pergunta obrigatoria e descricao do modelo (migration 0099)
--
--   1) Pergunta nova nasce obrigatoria (padrao TRUE): nada muda para as de hoje.
--   2) GESTOR marca a pergunta como nao obrigatoria e escreve a descricao.
--   3) Descricao acima de 500 caracteres e recusada (23514).
--   4) duplicar_modelo leva a descricao e o "obrigatoria" de cada pergunta.
--   5) INSPETOR le o "obrigatoria", mas nao o troca (a politica so deixa o GESTOR).
-- ============================================================================

begin;

select plan(6);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000991', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000992', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000991';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000992';

insert into public.modelos_checklist (nome) values ('Modelo 0099');
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo 0099';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select valor, 1, 'Pergunta 1 0099', 'CNA' from ids_teste where chave = 'modelo';
insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta)
  select valor, 2, 'Pergunta 2 0099', 'CNA' from ids_teste where chave = 'modelo';
insert into ids_teste (chave, valor) select 'p2', id from public.perguntas_checklist where texto = 'Pergunta 2 0099';

select ok(
  (select bool_and(obrigatoria) from public.perguntas_checklist
    where modelo_id = (select valor from ids_teste where chave = 'modelo')),
  'pergunta nova nasce obrigatoria'
);

-- GESTOR ----------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000991", "role": "authenticated"}';

select lives_ok(
  $$ update public.perguntas_checklist set obrigatoria = false
      where id = (select valor from ids_teste where chave = 'p2');
     update public.modelos_checklist set descricao = 'Ronda da noite'
      where id = (select valor from ids_teste where chave = 'modelo') $$,
  'GESTOR marca a pergunta como nao obrigatoria e escreve a descricao'
);

select throws_ok(
  $$ update public.modelos_checklist set descricao = repeat('x', 501)
      where id = (select valor from ids_teste where chave = 'modelo') $$,
  '23514', null, 'descricao acima de 500 caracteres e recusada'
);

insert into ids_teste (chave, valor)
select 'copia', public.duplicar_modelo((select valor from ids_teste where chave = 'modelo'), 'Copia 0099');

select results_eq(
  $$ select (select descricao from public.modelos_checklist where id = (select valor from ids_teste where chave = 'copia')),
            (select string_agg(obrigatoria::text, ',' order by ordem) from public.perguntas_checklist
              where modelo_id = (select valor from ids_teste where chave = 'copia')) $$,
  $$ values ('Ronda da noite'::text, 'true,false'::text) $$,
  'duplicar leva a descricao e o obrigatoria de cada pergunta'
);

reset role;

-- INSPETOR --------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000992", "role": "authenticated"}';

select is(
  (select obrigatoria from public.perguntas_checklist where id = (select valor from ids_teste where chave = 'p2')),
  false,
  'INSPETOR le o obrigatoria da pergunta (o app precisa dele)'
);

-- A politica de UPDATE so deixa o GESTOR: para os outros a linha nem aparece,
-- e o update passa sem mudar nada (USING, nao WITH CHECK).
update public.perguntas_checklist set obrigatoria = true
 where id = (select valor from ids_teste where chave = 'p2');

reset role;

select is(
  (select obrigatoria from public.perguntas_checklist where id = (select valor from ids_teste where chave = 'p2')),
  false,
  'INSPETOR nao troca o obrigatoria'
);

select * from finish();
rollback;
