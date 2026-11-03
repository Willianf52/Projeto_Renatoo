-- ============================================================================
-- pgTAP -- Cadastro de Eventos completo (migration 0083)
--
--   1) salvar_evento grava os campos novos de `p_extras`; chamar sem eles
--      (o jeito antigo) nao apaga o que estava gravado.
--   2) Finalizacao automatica sem Tempo para Finalizacao e recusada (23514).
--   3) alterar_eventos_em_massa: adiciona sites mantendo os atuais, e troca
--      tudo com "Remover antigas e atualizar"; o INSPETOR e recusado.
--   4) finalizar_ocorrencias_vencidas: encerra a ocorrencia vencida com o
--      Status final do evento e nao mexe na que ainda esta no prazo.
-- ============================================================================

begin;

select plan(9);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'evc.gestor@teste.local'),
  ('f0000000-0000-0000-0000-000000000832', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'evc.inspetor@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR' where id = 'f0000000-0000-0000-0000-000000000831';
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000000832';

insert into public.grupos_sites (nome) values ('Grupo Eventos 0083');
insert into public.sites (grupo_site_id, nome)
  select id, s from public.grupos_sites, unnest(array['Site A 0083', 'Site B 0083']) s where nome = 'Grupo Eventos 0083';
insert into ids_teste (chave, valor) select 'site_a', id from public.sites where nome = 'Site A 0083';
insert into ids_teste (chave, valor) select 'site_b', id from public.sites where nome = 'Site B 0083';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000831", "role": "authenticated"}';

-- ---------------------------------------------------------------------------
-- 1) Campos novos
-- ---------------------------------------------------------------------------
insert into ids_teste (chave, valor)
select 'auto', public.salvar_evento(
  null, 'Auto 0083', null, null, null, null, true,
  array[(select valor from ids_teste where chave = 'site_a')], '{}',
  jsonb_build_object(
    'tempo_finalizacao_minutos', 30, 'status_final', 'CANCELADO',
    'finalizacao_automatica', true, 'alarme', true, 'nps', 'NEUTRO',
    'emails_copia', jsonb_build_array('copia.0083@teste.local')));

select results_eq(
  $$ select tempo_finalizacao_minutos, status_final, finalizacao_automatica, alarme, nps, emails_copia
       from public.eventos where nome = 'Auto 0083' $$,
  $$ select 30, 'CANCELADO'::text, true, true, 'NEUTRO'::text, array['copia.0083@teste.local'] $$,
  'salvar_evento grava os campos da 0083'
);

select public.salvar_evento(
  (select valor from ids_teste where chave = 'auto'), 'Auto 0083', 'Nova descricao', null, null, null, true,
  array[(select valor from ids_teste where chave = 'site_a')], '{}');

select is(
  (select tempo_finalizacao_minutos from public.eventos where nome = 'Auto 0083'),
  30,
  'chamar do jeito antigo (sem p_extras) nao apaga os campos novos'
);

-- ---------------------------------------------------------------------------
-- 2) Finalizacao automatica exige tempo
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.salvar_evento(null, 'Sem Tempo 0083', null, null, null, null, true, '{}', '{}',
       jsonb_build_object('finalizacao_automatica', true)) $$,
  '23514', null,
  'finalizacao automatica sem tempo para finalizacao e recusada'
);

-- ---------------------------------------------------------------------------
-- 3) Alterar em massa
-- ---------------------------------------------------------------------------
insert into ids_teste (chave, valor)
select 'outro', public.salvar_evento(null, 'Outro 0083', null, null, null, null, true, '{}', '{}');

select is(
  public.alterar_eventos_em_massa(
    array[(select valor from ids_teste where chave = 'auto'), (select valor from ids_teste where chave = 'outro')],
    array[(select valor from ids_teste where chave = 'site_b')], null, false),
  2,
  'alterar em massa atinge os dois eventos'
);

select is(
  (select array_agg(site_id order by site_id) from public.eventos_sites
    where evento_id = (select valor from ids_teste where chave = 'auto')),
  array[(select valor from ids_teste where chave = 'site_a'), (select valor from ids_teste where chave = 'site_b')]
    ::bigint[],
  'manter as atuais e adicionar: o evento fica com o site antigo e o novo'
);

select public.alterar_eventos_em_massa(
  array[(select valor from ids_teste where chave = 'auto')],
  array[(select valor from ids_teste where chave = 'site_b')], null, true);

select is(
  (select array_agg(site_id) from public.eventos_sites
    where evento_id = (select valor from ids_teste where chave = 'auto')),
  array[(select valor from ids_teste where chave = 'site_b')]::bigint[],
  'remover antigas e atualizar: so os sites escolhidos'
);

-- Ocorrencias para a finalizacao (abertas agora, como GESTOR).
insert into ids_teste (chave, valor)
select 'vencida', public.registrar_ocorrencia_manual(
  (select valor from ids_teste where chave = 'site_b'), (select valor from ids_teste where chave = 'auto'),
  null, null, 'Vai vencer');
insert into ids_teste (chave, valor)
select 'no_prazo', public.registrar_ocorrencia_manual(
  (select valor from ids_teste where chave = 'site_b'), (select valor from ids_teste where chave = 'auto'),
  null, null, 'Ainda no prazo');

set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000832", "role": "authenticated"}';

select throws_ok(
  format($$ select public.alterar_eventos_em_massa(array[%s]::bigint[], '{}', null, false) $$,
    (select valor from ids_teste where chave = 'auto')),
  '42501', null,
  'o INSPETOR nao altera eventos em massa'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4) Finalizacao automatica
-- ---------------------------------------------------------------------------
-- Um tipo de analise ativo garantido para o andamento automatico.
insert into public.tipos_de_analise (nome, ativo)
select 'Tipo 0083', true
 where not exists (select 1 from public.tipos_de_analise where ativo);

update public.ocorrencias set criado_em = now() - interval '2 hours'
 where id = (select valor from ids_teste where chave = 'vencida');

select manutencao.finalizar_ocorrencias_vencidas();

select is(
  (select status from public.ocorrencias where id = (select valor from ids_teste where chave = 'vencida')),
  'CANCELADO',
  'a ocorrencia vencida e finalizada com o Status final do evento'
);

select is(
  (select status from public.ocorrencias where id = (select valor from ids_teste where chave = 'no_prazo')),
  'AGUARDANDO',
  'a ocorrencia ainda no prazo fica como estava'
);

select * from finish();
rollback;
