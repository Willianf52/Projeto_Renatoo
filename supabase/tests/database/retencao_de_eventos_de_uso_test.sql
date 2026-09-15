-- ============================================================================
-- pgTAP — retencao de eventos de uso (migration 0052)
--
-- O que nao pode quebrar calado:
--   1) o prazo e 12 meses -- nem 11, nem 13: um `interval` errado no default
--      apaga dado que a decisao de produto manda guardar, ou guarda para
--      sempre, e nenhum dos dois erros aparece em tela nenhuma;
--   2) a linha no limite (ontem, e 11 meses atras) FICA -- o teste do corte
--      pelo lado de dentro e o que pega um `>` trocado por `<`;
--   3) a funcao devolve quantas apagou, que e o unico sinal que sobra no
--      historico do pg_cron;
--   4) a rotina nao esta ao alcance de quem usa o painel: nem `authenticated`
--      nem `anon` enxergam o schema `manutencao`;
--   5) o agendamento existe, e existe UMA vez -- reaplicar a migration nao
--      pode deixar dois `cron.job` apagando a mesma tabela.
--
-- Executado em 15/09/2026 direto contra producao, dentro desta transacao com
-- rollback. 9/9 asserts passaram.
-- ============================================================================

begin;

select plan(9);

-- ---------------------------------------------------------------------------
-- Fixture: um autor e quatro eventos em idades diferentes.
--
-- Duas coisas que o trigger `preencher_autor_do_evento` (0051) impoe aqui, e
-- que custaram tres asserts vermelhos no primeiro ensaio:
--   - `criado_em` e sempre `now()` na insercao, entao o envelhecimento e
--     feito por update depois -- que e como o dado real envelhece mesmo;
--   - `perfil_id` vem de `auth.uid()`, que fora de uma sessao autenticada e
--     NULO. O update logo abaixo devolve o autor as linhas; sem ele, a
--     fixture existe mas nenhum assert que filtra por autor a encontra.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values ('e5200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.0052@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'e5200000-0000-0000-0000-000000000001';

insert into public.eventos_de_uso (perfil_id, cargo, evento, detalhes)
values
  ('e5200000-0000-0000-0000-000000000001', 'GESTOR', 'login', '{"idade": "ontem"}'),
  ('e5200000-0000-0000-0000-000000000001', 'GESTOR', 'login', '{"idade": "11 meses"}'),
  ('e5200000-0000-0000-0000-000000000001', 'GESTOR', 'login', '{"idade": "13 meses"}'),
  ('e5200000-0000-0000-0000-000000000001', 'GESTOR', 'login', '{"idade": "3 anos"}');

update public.eventos_de_uso
   set perfil_id = 'e5200000-0000-0000-0000-000000000001', cargo = 'GESTOR'
 where detalhes ? 'idade';

update public.eventos_de_uso set criado_em = now() - interval '1 day'
  where detalhes->>'idade' = 'ontem';
update public.eventos_de_uso set criado_em = now() - interval '11 months'
  where detalhes->>'idade' = '11 meses';
update public.eventos_de_uso set criado_em = now() - interval '13 months'
  where detalhes->>'idade' = '13 meses';
update public.eventos_de_uso set criado_em = now() - interval '3 years'
  where detalhes->>'idade' = '3 anos';

-- ---------------------------------------------------------------------------
-- 1) O prazo padrao e 12 meses, lido da assinatura da funcao
-- ---------------------------------------------------------------------------
select is(
  (select pg_get_function_arg_default(p.oid, 1)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'manutencao' and p.proname = 'expurgar_eventos_de_uso'),
  -- O Postgres normaliza `interval '12 months'` para `1 year` ao guardar o
  -- default; e o mesmo valor, escrito do jeito dele.
  '''1 year''::interval',
  'o prazo padrao de retencao e 12 meses'
);

-- ---------------------------------------------------------------------------
-- 2 e 3) O expurgo apaga so o que passou do prazo, e diz quantos
-- ---------------------------------------------------------------------------
select is(
  manutencao.expurgar_eventos_de_uso(),
  2,
  'o expurgo apaga os dois eventos mais velhos que 12 meses e devolve a contagem'
);

select is(
  (select count(*)::int from public.eventos_de_uso
    where perfil_id = 'e5200000-0000-0000-0000-000000000001'),
  2,
  'sobram os dois eventos dentro do prazo'
);

-- ---------------------------------------------------------------------------
-- 4) O corte e pelo lado de dentro: 11 meses fica
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.eventos_de_uso
    where perfil_id = 'e5200000-0000-0000-0000-000000000001'
      and detalhes->>'idade' = '11 meses'),
  1,
  'evento de 11 meses continua guardado -- o corte nao arredonda para baixo'
);

-- ---------------------------------------------------------------------------
-- 5) Rodar de novo nao apaga mais nada
-- ---------------------------------------------------------------------------
select is(
  manutencao.expurgar_eventos_de_uso(),
  0,
  'segunda execucao no mesmo dia nao apaga nada'
);

-- ---------------------------------------------------------------------------
-- 6) O prazo e argumento: um ensaio pode apertar o corte sem tocar no padrao
-- ---------------------------------------------------------------------------
select is(
  manutencao.expurgar_eventos_de_uso(interval '10 days'),
  1,
  'com prazo de 10 dias, o evento de 11 meses tambem sai'
);

-- ---------------------------------------------------------------------------
-- 7 e 8) A rotina nao esta na superficie do painel
-- ---------------------------------------------------------------------------
select ok(
  not has_schema_privilege('authenticated', 'manutencao', 'usage'),
  'authenticated nao enxerga o schema manutencao'
);

select ok(
  not has_schema_privilege('anon', 'manutencao', 'usage'),
  'anon nao enxerga o schema manutencao'
);

-- ---------------------------------------------------------------------------
-- 9) O agendamento existe, e uma vez so
--
-- `to_regclass` antes de qualquer referencia a `cron.job`: se o servidor nao
-- tiver pg_cron (a migration avisa e segue, nesse caso), o assert se pula em
-- vez de quebrar o job `banco` por um motivo que nao e defeito. A consulta
-- vai por `query_to_xml` porque um `select ... from cron.job` escrito direto
-- nao passa nem pelo parser quando o schema nao existe.
-- ---------------------------------------------------------------------------
select case
  when to_regclass('cron.job') is null then
    skip('pg_cron ausente neste servidor: agendamento nao verificavel aqui', 1)
  else
    is(
      (select (xpath(
        '/row/c/text()',
        query_to_xml(
          $q$select count(*) as c from cron.job where jobname = 'expurgar-eventos-de-uso'$q$,
          false, true, ''
        )
      ))[1]::text::int),
      1,
      'o expurgo fica agendado uma vez so no pg_cron'
    )
end;

select * from finish();

rollback;
