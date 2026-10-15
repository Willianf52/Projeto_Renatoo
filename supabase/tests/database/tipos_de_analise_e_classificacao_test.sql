-- ============================================================================
-- pgTAP — cadastro de Tipos de Analise e de Classificacao (0071)
--
--   1) GESTOR cadastra tipo de analise com cor.
--   2) GESTOR edita (renomeia e desativa) tipo de classificacao.
--   3) SUPERVISOR le, mas nao cadastra -- 42501 (na referencia o menu nem
--      aparece para ele).
--   4) Cor fora do formato #RRGGBB e recusada pelo banco.
--   5) O cadastro fica na `auditoria` com o GESTOR como ator.
--   6) Ninguem apaga pela API (desativa por `ativo`).
-- ============================================================================

begin;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('e0000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.tipos@teste.local'),
  ('e0000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'supervisor.tipos@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'e0000000-0000-0000-0000-000000000711';
update public.profiles set ativo = true, cargo = 'SUPERVISOR' where id = 'e0000000-0000-0000-0000-000000000712';

insert into public.tipos_de_classificacao (nome) values ('Classificacao Teste 0071');

-- GESTOR ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000711", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.tipos_de_analise (nome, cor) values ('Analise Teste 0071', '#1A2B3C') $$,
  'GESTOR cadastra tipo de analise com cor'
);

update public.tipos_de_classificacao set nome = 'Classificacao Editada 0071', ativo = false
 where nome = 'Classificacao Teste 0071';

select results_eq(
  $$ select nome, ativo from public.tipos_de_classificacao where nome = 'Classificacao Editada 0071' $$,
  $$ values ('Classificacao Editada 0071'::text, false) $$,
  'GESTOR renomeia e desativa tipo de classificacao'
);

select throws_ok(
  $$ insert into public.tipos_de_analise (nome, cor) values ('Cor Invalida 0071', 'azul') $$,
  '23514',
  null,
  'cor fora do formato #RRGGBB e recusada'
);

select throws_ok(
  $$ delete from public.tipos_de_analise where nome = 'Analise Teste 0071' $$,
  '42501',
  null,
  'ninguem apaga tipo pela API: desativa por ativo'
);

reset role;

-- SUPERVISOR --------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000712", "role": "authenticated"}';

select ok(
  (select count(*) from public.tipos_de_analise where nome = 'Analise Teste 0071') = 1,
  'SUPERVISOR le os tipos (escolhe na analise da ocorrencia)'
);

select throws_ok(
  $$ insert into public.tipos_de_analise (nome) values ('Supervisor Tenta 0071') $$,
  '42501',
  null,
  'SUPERVISOR nao cadastra tipo de analise'
);

reset role;

select results_eq(
  $$ select operacao, ator_id::text from public.auditoria
      where tabela = 'tipos_de_analise' and dados_novos ->> 'nome' = 'Analise Teste 0071' $$,
  $$ values ('INSERT'::text, 'e0000000-0000-0000-0000-000000000711'::text) $$,
  'o cadastro fica na auditoria com o GESTOR como ator'
);

select * from finish();

rollback;
