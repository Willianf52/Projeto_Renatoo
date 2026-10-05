-- ============================================================================
-- pgTAP — ocorrencias abertas pelo checklist (migration 0063)
--
--   1) Um checklist com "Nao conforme" (CNA e CN) e "Sim" (SN) abre uma
--      ocorrencia por resposta dessas -- e "Conforme" nao abre.
--   2) O tipo do evento vem da pergunta; sem tipo, "NAO CONFORMIDADE".
--   3) Numero/ano sequencial, sem repetir.
--   4) Nasce AGUARDANDO, aberta pelo autor da visita, com o texto da pergunta.
--   5) "Nao" na pergunta Sim/Nao NAO abre (decisao do dono, 05/10/2026).
--   6) O INSPETOR le as ocorrencias da propria visita.
--   7) Outro INSPETOR nao le.
--   8) Ninguem grava ocorrencia direto -- so o trigger (42501).
--   9) Nem muda o status direto (42501).
--  10) A base dos relatorios de Eventos conta as ocorrencias.
--  11) A funcao do trigger nao e executavel por `authenticated`.
--  (Os itens 1 e 2 sao conferidos num assert so: 10 asserts.)
--
-- Ids alheios vao para `ids_teste` (sem RLS) antes de trocar de role -- ver a
-- nota em `checklist_de_visitas_test.sql`.
-- ============================================================================

begin;

select plan(10);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oco.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oco.inspetor@teste.local'),
  ('f0000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oco.outro@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000631';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000632';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000633';

insert into public.grupos_sites (nome) values ('Grupo Ocorrencia 0063');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Ocorrencia 0063' from public.grupos_sites where nome = 'Grupo Ocorrencia 0063';
insert into public.modelos_checklist (nome) values ('Modelo Ocorrencia 0063');

insert into ids_teste (chave, valor) select 'grupo', id from public.grupos_sites where nome = 'Grupo Ocorrencia 0063';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Ocorrencia 0063';
insert into ids_teste (chave, valor) select 'modelo', id from public.modelos_checklist where nome = 'Modelo Ocorrencia 0063';

insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
  values ((select valor from ids_teste where chave = 'modelo'), (select valor from ids_teste where chave = 'grupo'));

insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta, evento_id) values
  ((select valor from ids_teste where chave = 'modelo'), 1, 'Limpeza do banheiro 0063', 'CNA',
   (select id from public.eventos where nome = 'LIMPEZA')),
  ((select valor from ids_teste where chave = 'modelo'), 2, 'Pergunta sem tipo 0063', 'CNA', null),
  ((select valor from ids_teste where chave = 'modelo'), 3, 'Duvidas com o RH 0063', 'SN',
   (select id from public.eventos where nome = 'RH')),
  ((select valor from ids_teste where chave = 'modelo'), 4, 'Pergunta CN 0063', 'CN',
   (select id from public.eventos where nome = 'EPI'));

insert into ids_teste (chave, valor) select 'p_limpeza', id from public.perguntas_checklist where texto = 'Limpeza do banheiro 0063';
insert into ids_teste (chave, valor) select 'p_sem_tipo', id from public.perguntas_checklist where texto = 'Pergunta sem tipo 0063';
insert into ids_teste (chave, valor) select 'p_rh', id from public.perguntas_checklist where texto = 'Duvidas com o RH 0063';
insert into ids_teste (chave, valor) select 'p_cn', id from public.perguntas_checklist where texto = 'Pergunta CN 0063';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('96301', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000632'),
  ('96302', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000632');
insert into ids_teste (chave, valor) select 'visita_1', id from public.visitas where numero_coleta = '96301';
insert into ids_teste (chave, valor) select 'visita_2', id from public.visitas where numero_coleta = '96302';

-- O INSPETOR envia os dois checklists ---------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000632", "role": "authenticated"}';

-- Checklist 1: Nao conforme (com tipo), Nao conforme (sem tipo), Sim no RH e
-- "Conforme" na CN (SIM = Conforme, nao abre).
insert into ids_teste (chave, valor)
select 'checklist_1', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_1'),
  'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_1')),
  array[]::text[],
  jsonb_build_array(
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_limpeza'), 'resposta', 'NAO', 'observacao', 'Banheiro sujo'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_sem_tipo'), 'resposta', 'NAO'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_rh'), 'resposta', 'SIM'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_cn'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo')
);

-- Checklist 2: "Nao" no RH e tudo conforme -- nada abre.
insert into ids_teste (chave, valor)
select 'checklist_2', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_2'),
  'CONSULTORIA', '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_2')),
  array[]::text[],
  jsonb_build_array(
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_limpeza'), 'resposta', 'SIM'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_sem_tipo'), 'resposta', 'NA'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_rh'), 'resposta', 'NAO'),
    jsonb_build_object('pergunta_id', (select valor from ids_teste where chave = 'p_cn'), 'resposta', 'SIM')),
  (select valor from ids_teste where chave = 'modelo')
);

-- 6) O INSPETOR le as da propria visita.
select is(
  (select count(*)::int from public.ocorrencias
    where visita_id = (select valor from ids_teste where chave = 'visita_1')),
  3,
  'INSPETOR le as 3 ocorrencias da propria visita'
);

-- 8) e 9) Ninguem escreve direto.
select throws_ok(
  format(
    $$ insert into public.ocorrencias (numero, ano, visita_id, site_id, checklist_id, pergunta_id, evento_id, pergunta_texto, resposta)
       values (999, 2026, %L, %L, %L, %L, (select id from public.eventos limit 1), 'x', 'NAO') $$,
    (select valor from ids_teste where chave = 'visita_2'),
    (select valor from ids_teste where chave = 'site'),
    (select valor from ids_teste where chave = 'checklist_2'),
    (select valor from ids_teste where chave = 'p_limpeza')
  ),
  '42501',
  null,
  'INSPETOR nao grava ocorrencia direto'
);

select throws_ok(
  $$ update public.ocorrencias set status = 'ATENDIDO' $$,
  '42501',
  null,
  'INSPETOR nao muda o status direto'
);

reset role;

-- 1) a 5) Conferido como dono --------------------------------------------------
select results_eq(
  format(
    $$ select p.texto, e.nome, o.resposta, coalesce(o.observacao, '') from public.ocorrencias o
         join public.perguntas_checklist p on p.id = o.pergunta_id
         join public.eventos e on e.id = o.evento_id
        where o.checklist_id = %L order by p.ordem $$,
    (select valor from ids_teste where chave = 'checklist_1')
  ),
  $$ values
       ('Limpeza do banheiro 0063'::text, 'LIMPEZA'::text, 'NAO'::text, 'Banheiro sujo'::text),
       ('Pergunta sem tipo 0063', 'NÃO CONFORMIDADE', 'NAO', ''),
       ('Duvidas com o RH 0063', 'RH', 'SIM', '') $$,
  'abre uma por Nao conforme e Sim do RH, com o tipo da pergunta (sem tipo: NAO CONFORMIDADE)'
);

select is(
  (select count(*)::int from public.ocorrencias
    where checklist_id = (select valor from ids_teste where chave = 'checklist_2')),
  0,
  '"Nao" no RH, Conforme e Nao se aplica nao abrem'
);

select is(
  (select format('%s|%s|%s', count(distinct numero), max(numero) - min(numero), bool_and(ano = extract(year from now() at time zone 'America/Sao_Paulo')))
     from public.ocorrencias
    where checklist_id = (select valor from ids_teste where chave = 'checklist_1')),
  '3|2|t',
  'numero/ano sequencial e sem repetir'
);

select is(
  (select format('%s|%s|%s', bool_and(status = 'AGUARDANDO'), bool_and(aberta_por = 'f0000000-0000-0000-0000-000000000632'),
          bool_and(pergunta_texto like '%0063'))
     from public.ocorrencias
    where checklist_id = (select valor from ids_teste where chave = 'checklist_1')),
  't|t|t',
  'nasce AGUARDANDO, aberta pelo autor da visita, com o texto da pergunta'
);

-- 7) Outro INSPETOR nao le -----------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000633", "role": "authenticated"}';

select is(
  (select count(*)::int from public.ocorrencias),
  0,
  'outro INSPETOR nao le as ocorrencias de visita alheia'
);

reset role;

-- 10) A base dos relatorios ------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000631", "role": "authenticated"}';

select is(
  (select count(*)::int
     from public.ocorrencias_de_evento(now() - interval '1 day', now() + interval '1 day', false,
            jsonb_build_object('site', (select valor from ids_teste where chave = 'site')))),
  3,
  'ocorrencias_de_evento conta as ocorrencias do checklist'
);

reset role;

-- 11) A funcao do trigger fica fora do alcance ----------------------------------
select is(
  has_function_privilege('authenticated', 'manutencao.abrir_ocorrencia_da_resposta()', 'EXECUTE'),
  false,
  'authenticated nao executa a funcao do trigger'
);

select * from finish();
rollback;
