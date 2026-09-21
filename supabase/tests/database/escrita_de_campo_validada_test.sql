-- ============================================================================
-- pgTAP — escrita de campo validada (migration 0054, achado M3 de 16/09/2026)
--
--   1) authenticated nao escreve `criado_em` nem `data_integracao` em
--      `visitas`/`leituras` -- o carimbo e do servidor.
--   2) As colunas que o app envia continuam liberadas.
--   3) INSPETOR grava visita e leitura com o QR do proprio site.
--   4) Recusa: `criado_em` forjado, QR de outro site, `data_hora` de 31 dias
--      atras e de 2 horas a frente.
--   5) Reenvio de leitura que ja existe (a fila offline) nao cai na validacao
--      de janela -- colide como sempre colidiu.
--   6) Escrita sem sessao (service_role/postgres, a importacao) nao passa pelo
--      trigger.
--
-- Ids capturados em tabela temporaria SEM RLS antes de trocar de role -- o
-- mesmo cuidado de escrita_de_campo_por_inspetor_test.sql.
-- ============================================================================

begin;

select plan(14);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values ('e0540000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inspetor.0054@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id = 'e0540000-0000-0000-0000-000000000001';

insert into public.grupos_sites (nome) values ('Grupo 0054');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site A 0054' from public.grupos_sites where nome = 'Grupo 0054';
insert into public.sites (grupo_site_id, nome)
  select id, 'Site B 0054' from public.grupos_sites where nome = 'Grupo 0054';
insert into public.qr_codes (site_id, codigo)
  select id, 'QR-A-0054' from public.sites where nome = 'Site A 0054';
insert into public.qr_codes (site_id, codigo)
  select id, 'QR-B-0054' from public.sites where nome = 'Site B 0054';

insert into ids_teste (chave, valor)
  select 'site_a', id from public.sites where nome = 'Site A 0054'
  union all select 'qr_a', id from public.qr_codes where codigo = 'QR-A-0054'
  union all select 'qr_b', id from public.qr_codes where codigo = 'QR-B-0054';

-- ---------------------------------------------------------------------------
-- 1-2) Grants por coluna.
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.visitas', 'criado_em', 'INSERT'),
  'authenticated nao escreve visitas.criado_em'
);
select ok(
  not has_column_privilege('authenticated', 'public.visitas', 'data_integracao', 'INSERT'),
  'authenticated nao escreve visitas.data_integracao'
);
select ok(
  not has_column_privilege('authenticated', 'public.leituras', 'criado_em', 'INSERT'),
  'authenticated nao escreve leituras.criado_em'
);
select ok(
  not has_column_privilege('authenticated', 'public.leituras', 'data_integracao', 'INSERT'),
  'authenticated nao escreve leituras.data_integracao'
);
select ok(
  has_column_privilege('authenticated', 'public.leituras', 'qr_code_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.leituras', 'tem_localizacao', 'INSERT')
    and has_column_privilege('authenticated', 'public.visitas', 'numero_coleta', 'INSERT'),
  'as colunas que o app envia continuam liberadas'
);

-- ---------------------------------------------------------------------------
-- 3-4) INSPETOR: caminho legitimo e as recusas.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0540000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id)
       values ('0054-1', %L, 'e0540000-0000-0000-0000-000000000001') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  'INSPETOR grava visita sem informar carimbo de tempo'
);

select throws_ok(
  format(
    $$ insert into public.visitas (numero_coleta, site_id, funcionario_id, criado_em)
       values ('0054-2', %L, 'e0540000-0000-0000-0000-000000000001', '2020-01-01') $$,
    (select valor from ids_teste where chave = 'site_a')
  ),
  '42501',
  'permission denied for table visitas',
  'INSPETOR nao forja criado_em da visita -- recusa do grant por coluna, nao do RLS'
);

reset role;
insert into ids_teste (chave, valor) select 'visita', id from public.visitas where numero_coleta = '0054-1';
set local role authenticated;

select lives_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora, qr_code_id) values (%L, now(), %L) $$,
    (select valor from ids_teste where chave = 'visita'),
    (select valor from ids_teste where chave = 'qr_a')
  ),
  'INSPETOR grava leitura com o QR do site da visita'
);

-- throws_like e nao so o SQLSTATE: 42501 tambem e o codigo do RLS, e o teste
-- precisa provar que quem recusou foi o trigger da 0054.
select throws_like(
  format(
    $$ insert into public.leituras (visita_id, data_hora, qr_code_id) values (%L, now() + interval '1 minute', %L) $$,
    (select valor from ids_teste where chave = 'visita'),
    (select valor from ids_teste where chave = 'qr_b')
  ),
  '%nao pertence ao site da visita%',
  'INSPETOR nao pendura QR-code de outro site na visita'
);

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now() - interval '31 days') $$,
    (select valor from ids_teste where chave = 'visita')
  ),
  '22008',
  null,
  'leitura de 31 dias atras e recusada'
);

select throws_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora) values (%L, now() + interval '2 hours') $$,
    (select valor from ids_teste where chave = 'visita')
  ),
  '22008',
  null,
  'leitura de 2 horas a frente e recusada'
);

-- ---------------------------------------------------------------------------
-- 5) Reenvio da fila: a leitura antiga ja esta gravada (fixture de postgres);
--    o app reenvia com `on conflict do nothing` e nada quebra.
-- ---------------------------------------------------------------------------
reset role;

insert into public.leituras (visita_id, data_hora)
  select valor, date_trunc('second', now()) - interval '60 days' from ids_teste where chave = 'visita';

set local role authenticated;

select lives_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora)
       values (%L, date_trunc('second', now()) - interval '60 days')
       on conflict do nothing $$,
    (select valor from ids_teste where chave = 'visita')
  ),
  'reenvio de leitura que ja existe nao cai na janela de tempo'
);

reset role;

select is(
  (select count(*)::int from public.leituras l
     join ids_teste i on i.chave = 'visita' and l.visita_id = i.valor
    where l.data_hora = date_trunc('second', now()) - interval '60 days'),
  1,
  'o reenvio nao duplicou a leitura'
);

-- ---------------------------------------------------------------------------
-- 6) Sem sessao de usuario (importacao via service_role): sem validacao.
--    `reset role` acima deixa `role` em 'none'; as claims continuam setadas de
--    proposito, provando que o trigger decide pelo papel, nao por auth.uid().
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    $$ insert into public.leituras (visita_id, data_hora, qr_code_id) values (%L, now() - interval '90 days', %L) $$,
    (select valor from ids_teste where chave = 'visita'),
    (select valor from ids_teste where chave = 'qr_b')
  ),
  'escrita sem sessao de usuario (importacao) nao passa pela validacao de campo'
);

select * from finish();

rollback;
