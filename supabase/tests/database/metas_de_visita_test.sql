-- ============================================================================
-- pgTAP -- meta de visitas por pessoa, lugar e periodo (migrations 0105/0106)
--
--   1) So quem administra cadastros cria meta; cada pessoa ve so as proprias.
--   2) O progresso conta qualquer checklist enviado pela pessoa no lugar,
--      so no periodo (aqui, a semana de segunda a domingo).
--   3) Os periodos: dia, semana, quinzenas 1-15 e 16-fim, mes.
--   4) O aviso vai so para quem esta abaixo da meta, no dia de aviso do
--      periodo, uma vez por periodo.
-- ============================================================================

begin;

select plan(11);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000001051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'meta.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000001052', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'meta.abaixo@teste.local'),
  ('f0000000-0000-0000-0000-000000001053', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'meta.batida@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000001051';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id in ('f0000000-0000-0000-0000-000000001052', 'f0000000-0000-0000-0000-000000001053');

insert into public.grupos_sites (nome) values ('Grupo Meta 0105');
insert into public.sites (grupo_site_id, nome)
  select id, 'Site Meta 0105' from public.grupos_sites where nome = 'Grupo Meta 0105';
insert into ids_teste (chave, valor) select 'site', id from public.sites where nome = 'Site Meta 0105';

-- ---------------------------------------------------------------------------
-- 1) Quem cria e quem ve
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001052", "role": "authenticated"}';

select throws_ok(
  format($$ insert into public.metas_de_visita (usuario_id, site_id, periodo, quantidade)
            values ('f0000000-0000-0000-0000-000000001052', %s, 'SEMANAL', 4) $$, (select valor from ids_teste where chave = 'site')),
  '42501', null,
  'o INSPETOR nao cria a propria meta'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001051", "role": "authenticated"}';

select lives_ok(
  format($$ insert into public.metas_de_visita (usuario_id, site_id, periodo, quantidade) values
            ('f0000000-0000-0000-0000-000000001052', %1$s, 'SEMANAL', 3),
            ('f0000000-0000-0000-0000-000000001053', %1$s, 'SEMANAL', 1) $$, (select valor from ids_teste where chave = 'site')),
  'o GESTOR cria metas'
);

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001052", "role": "authenticated"}';

select is(
  (select count(*)::int from public.metas_de_visita where site_id = (select valor from ids_teste where chave = 'site')),
  1,
  'o INSPETOR ve so a propria meta'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2) Progresso: um checklist desta semana para cada inspetor, e um antigo
-- ---------------------------------------------------------------------------
-- Sem login ativo: `enviado_por` vem do auth.uid(), e o do passo anterior
-- (um dos inspetores) faria os checklists contarem para ele.
set local "request.jwt.claims" to '{}';

insert into public.visitas (numero_coleta, site_id, funcionario_id) values
  ('910501', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001052'),
  ('910502', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001053'),
  ('910503', (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000001052');

insert into public.checklists_visita (visita_id, tipo, assinatura_path, criado_em)
select v.id, 'CONSULTORIA', v.id || '/assinatura.png',
       case when v.numero_coleta = '910503' then now() - interval '30 days' else now() end
  from public.visitas v where v.numero_coleta in ('910501', '910502', '910503');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000001051", "role": "authenticated"}';

select is(
  (select feitas from public.progresso_das_metas()
    where usuario_id = 'f0000000-0000-0000-0000-000000001052'),
  1,
  'conta so o checklist desta semana (o de 30 dias atras fica de fora)'
);

select is(
  (select feitas from public.progresso_das_metas()
    where usuario_id = 'f0000000-0000-0000-0000-000000001053'),
  1,
  'cada inspetor tem o proprio progresso'
);

select is(
  (select inicio from public.progresso_das_metas('2026-11-20') limit 1),
  '2026-11-16'::date,
  'a semana de sexta 20/11/2026 comeca na segunda 16/11'
);

select is(
  (select array[p.inicio, p.fim] from public.periodo_da_meta('QUINZENAL', '2026-11-18') p),
  array['2026-11-16', '2026-12-01']::date[],
  'a segunda quinzena vai do dia 16 ao fim do mes'
);

select is(
  (select array[p.inicio, p.fim] from public.periodo_da_meta('MENSAL', '2026-02-10') p),
  array['2026-02-01', '2026-03-01']::date[],
  'o mes vai do dia 1 ao ultimo dia'
);

select is(
  (select array[p.inicio, p.fim] from public.periodo_da_meta('DIARIA', '2026-11-18') p),
  array['2026-11-18', '2026-11-19']::date[],
  'a meta diaria e o proprio dia'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3) Aviso de sexta
-- ---------------------------------------------------------------------------
-- O dia de aviso da semanal e a sexta da semana corrente.
create temporary table sexta as
  select (date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date::timestamp)::date + 4) as dia;
select manutencao.avisar_metas(array['SEMANAL'], (select dia from sexta) - 1);
select manutencao.avisar_metas(array['SEMANAL'], (select dia from sexta));
select manutencao.avisar_metas(array['SEMANAL'], (select dia from sexta));

select is(
  (select array_agg(p.email order by p.email)
     from public.notificacoes n
     join public.profiles p on p.id = n.destinatario_id
    where n.tipo = 'META_DE_VISITA' and p.email like 'meta.%'),
  array['meta.abaixo@teste.local'],
  'o aviso vai so na sexta, so para quem esta abaixo da meta, uma vez por semana'
);

select ok(
  (select texto from public.notificacoes n
     join public.profiles p on p.id = n.destinatario_id
    where n.tipo = 'META_DE_VISITA' and p.email = 'meta.abaixo@teste.local') like 'Site Meta 0105: 1 de 3%',
  'o aviso diz o lugar e quantas faltam'
);

select * from finish();
rollback;
