-- ============================================================================
-- pgTAP — escrita das perguntas do checklist (migration 0043)
--
--   1) GESTOR cadastra pergunta -- sucesso.
--   2) GESTOR edita o texto -- sucesso (a policy de UPDATE tem `using` e
--      `with check` iguais).
--   3) GESTOR despublica com `ativo = false` -- o caminho que substitui o
--      DELETE.
--   4) DELETE é recusado com 42501 por falta de grant. Confirma que a recusa
--      é **alta**, e não o zero-linhas silencioso da seção 4 da doutrina de
--      RLS: sem grant, o Postgres levanta antes de a policy ou a FK entrarem.
--   5) INSPETOR continua lendo as perguntas (policy de SELECT da 0042) --
--      é o que o app de campo precisa para montar o checklist.
--   6) INSPETOR não cadastra pergunta -- nega.
--
-- Executado (2026-08-27) direto contra o projeto Supabase de produção, dentro
-- de uma transação com rollback, ANTES de a migration ser aplicada. 6/6
-- passaram; nada persistiu.
--
-- O assert 4 nasceu errado: escrito como `delete` solto esperando zero linhas,
-- ele abortou a transação inteira com 42501. A recusa por falta de grant é
-- exceção, não filtro -- por isso ele é `throws_ok`, e não um `is` de contagem.
-- ============================================================================

begin;

select plan(6);

-- Fixture: um GESTOR (administra cadastros), um INSPETOR (só lê) e um GESTOR
-- inativo -- `pode_administrar_cadastros()` exige conta ativa, e sem esse
-- terceiro perfil o teste não distinguiria "cargo errado" de "conta desligada".
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.gestor.inativo@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'f0000000-0000-0000-0000-000000000031';
update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'f0000000-0000-0000-0000-000000000032';
update public.profiles set ativo = false, cargo = 'GESTOR'
  where id = 'f0000000-0000-0000-0000-000000000033';

-- ---------------------------------------------------------------------------
-- 1, 2 e 3) O caminho feliz da gestão.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000031", "role": "authenticated"}';

insert into public.perguntas_checklist (ordem, texto) values (801, 'Extintores no prazo?');

select is(
  (select count(*)::int from public.perguntas_checklist where ordem = 801),
  1,
  'GESTOR cadastra pergunta do checklist'
);

update public.perguntas_checklist set texto = 'Extintores dentro da validade?' where ordem = 801;

select is(
  (select texto from public.perguntas_checklist where ordem = 801),
  'Extintores dentro da validade?',
  'GESTOR edita pergunta do checklist'
);

update public.perguntas_checklist set ativo = false where ordem = 801;

select is(
  (select ativo from public.perguntas_checklist where ordem = 801),
  false,
  'GESTOR despublica a pergunta com ativo = false'
);

-- ---------------------------------------------------------------------------
-- 4) DELETE recusado por falta de grant -- alto, não em silêncio.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.perguntas_checklist where ordem = 801 $$,
  '42501',
  null,
  'DELETE e recusado por falta de grant -- despublicar e ativo = false'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5 e 6) O INSPETOR lê, mas não escreve.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000032", "role": "authenticated"}';

select is(
  (select count(*)::int from public.perguntas_checklist where ordem = 801),
  1,
  'INSPETOR le a pergunta para responder em campo'
);

select throws_ok(
  $$ insert into public.perguntas_checklist (ordem, texto) values (802, 'nao deveria entrar') $$,
  '42501',
  null,
  'INSPETOR nao cadastra pergunta do checklist'
);

reset role;

select * from finish();

rollback;
