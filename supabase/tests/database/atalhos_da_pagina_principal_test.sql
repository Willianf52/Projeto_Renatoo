-- ============================================================================
-- pgTAP -- atalhos da Pagina Principal (migration 0062)
--
-- O que nao pode quebrar calado:
--   1) cada pessoa so ve e so troca os PROPRIOS atalhos fixados;
--   2) a grade tem 12 posicoes: posicao 12 e recusada, e a troca inteira volta
--      (nao sobra metade gravada);
--   3) rota fora do painel e recusada -- o valor vira `href` na tela;
--   4) "Restaurar padrao" (lista vazia) apaga so os da propria pessoa;
--   5) pessoa inativa nao grava;
--   6) `uso_das_minhas_telas` conta so o uso de quem pergunta -- inclusive
--      para a gestao, que pela policy da 0051 enxerga o uso de todo mundo.
-- ============================================================================

begin;

select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('e6200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0062@teste.local'),
  ('e6200000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.0062@teste.local'),
  ('e6200000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inativo.0062@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'e6200000-0000-0000-0000-000000000001';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'e6200000-0000-0000-0000-000000000002';
update public.profiles set ativo = false, cargo = 'INSPETOR' where id = 'e6200000-0000-0000-0000-000000000003';

-- Uso: 3 aberturas do gestor e 1 do inspetor na mesma tela, no mes passado,
-- e 1 do gestor fora da janela.
insert into public.eventos_de_uso (evento, detalhes)
values
  ('tela_aberta', '{"rota": "/dashboard/cadastros/usuarios", "teste": "g1"}'),
  ('tela_aberta', '{"rota": "/dashboard/cadastros/usuarios", "teste": "g2"}'),
  ('tela_aberta', '{"rota": "/dashboard/cadastros/qr-code", "teste": "g3"}'),
  ('tela_aberta', '{"rota": "/dashboard/cadastros/usuarios", "teste": "i1"}'),
  ('tela_aberta', '{"rota": "/dashboard/cadastros/usuarios", "teste": "g-velho"}');

update public.eventos_de_uso
   set perfil_id = 'e6200000-0000-0000-0000-000000000001', criado_em = '2026-09-10'
 where detalhes->>'teste' in ('g1', 'g2', 'g3');
update public.eventos_de_uso
   set perfil_id = 'e6200000-0000-0000-0000-000000000002', criado_em = '2026-09-10'
 where detalhes->>'teste' = 'i1';
update public.eventos_de_uso
   set perfil_id = 'e6200000-0000-0000-0000-000000000001', criado_em = '2026-07-10'
 where detalhes->>'teste' = 'g-velho';

-- ---------------------------------------------------------------------------
-- Gestor fixa dois atalhos
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e6200000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ select public.salvar_atalhos_fixados('[{"rota": "/dashboard/cadastros/usuarios", "posicao": 0}, {"rota": "/dashboard/principal", "posicao": 5}]') $$,
  'gestor fixa dois atalhos'
);

select results_eq(
  $$ select rota, posicao from public.atalhos_fixados order by posicao $$,
  $$ values ('/dashboard/cadastros/usuarios'::text, 0::smallint), ('/dashboard/principal'::text, 5::smallint) $$,
  'gestor le os proprios atalhos, na posicao em que fixou'
);

select results_eq(
  $$ select rota, vezes from public.uso_das_minhas_telas('2026-09-01', '2026-10-01') order by rota $$,
  $$ values ('/dashboard/cadastros/qr-code'::text, 1::bigint), ('/dashboard/cadastros/usuarios'::text, 2::bigint) $$,
  'uso_das_minhas_telas conta so o uso do gestor, so na janela -- sem o do inspetor'
);

select throws_ok(
  $$ select public.salvar_atalhos_fixados('[{"rota": "/dashboard/cadastros/qr-code", "posicao": 1}, {"rota": "/dashboard/eventos", "posicao": 12}]') $$,
  '23514',
  null,
  'posicao 12 (fora da grade de 12) e recusada'
);

select is(
  (select count(*) from public.atalhos_fixados)::int, 2,
  'a troca recusada volta inteira: os dois atalhos de antes continuam'
);

select throws_ok(
  $$ select public.salvar_atalhos_fixados('[{"rota": "https://site-falso.com", "posicao": 0}]') $$,
  '23514',
  null,
  'rota fora do painel e recusada'
);

reset role;

-- ---------------------------------------------------------------------------
-- Inspetor: nao ve os do gestor e o "Restaurar padrao" dele nao os apaga
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e6200000-0000-0000-0000-000000000002", "role": "authenticated"}';

select is_empty(
  $$ select 1 from public.atalhos_fixados $$,
  'inspetor nao ve os atalhos do gestor'
);

select lives_ok(
  $$ select public.salvar_atalhos_fixados('[]') $$,
  'inspetor restaura o padrao'
);

select results_eq(
  $$ select rota, vezes from public.uso_das_minhas_telas('2026-09-01', '2026-10-01') $$,
  $$ values ('/dashboard/cadastros/usuarios'::text, 1::bigint) $$,
  'inspetor le so o proprio uso'
);

reset role;

select is(
  (select count(*) from public.atalhos_fixados where perfil_id = 'e6200000-0000-0000-0000-000000000001')::int, 2,
  'o "Restaurar padrao" do inspetor nao apagou os atalhos do gestor'
);

-- ---------------------------------------------------------------------------
-- Pessoa inativa nao grava
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e6200000-0000-0000-0000-000000000003", "role": "authenticated"}';

select throws_ok(
  $$ select public.salvar_atalhos_fixados('[{"rota": "/dashboard/cadastros/usuarios", "posicao": 0}]') $$,
  '42501',
  null,
  'pessoa inativa nao fixa atalho'
);

reset role;

select * from finish();
rollback;
