-- ============================================================================
-- pgTAP — trilha de auditoria nos modelos e perguntas do checklist (0070)
--
--   1) INSERT em `modelos_checklist` pelo GESTOR grava ator e operacao.
--   2) UPDATE em `perguntas_checklist` grava o texto antigo e o novo.
--   3) `modelos_checklist_grupos` (chave composta, sem `id`) grava, com
--      `registro_id` = "modelo:grupo" -- antes da 0070, o trigger nesta
--      tabela teria feito toda gravacao falhar (`registro_id` e not null).
--   4) DELETE da ligacao preserva a linha antiga e deixa `dados_novos` nulo.
--   5) Tabela com `id` (grupos_usuarios, 0034) continua com `registro_id` =
--      `id`: o caminho sem argumento nao mudou.
--   6) `create or replace` nao reabriu EXECUTE da funcao para `authenticated`.
-- ============================================================================

begin;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values ('e0000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gestor.auditoria.modelos@teste.local');

update public.profiles set ativo = true, cargo = 'GESTOR'
  where id = 'e0000000-0000-0000-0000-000000000701';

-- O grupo de sites entra como dono do banco: nao e o que se testa aqui.
insert into public.grupos_sites (nome) values ('Grupo Auditoria Modelos');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000701", "role": "authenticated"}';

insert into public.modelos_checklist (nome) values ('Modelo Auditoria Teste');

insert into public.perguntas_checklist (modelo_id, ordem, texto)
select id, 1, 'Pergunta original' from public.modelos_checklist where nome = 'Modelo Auditoria Teste';

update public.perguntas_checklist set texto = 'Pergunta editada'
  where texto = 'Pergunta original';

insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
select m.id, g.id
  from public.modelos_checklist m, public.grupos_sites g
 where m.nome = 'Modelo Auditoria Teste' and g.nome = 'Grupo Auditoria Modelos';

delete from public.modelos_checklist_grupos
 where modelo_id = (select id from public.modelos_checklist where nome = 'Modelo Auditoria Teste');

insert into public.grupos_usuarios (nome) values ('Grupo Usuarios Auditoria 0070');

reset role;

select results_eq(
  $$ select operacao, ator_id::text from public.auditoria
      where tabela = 'modelos_checklist' and dados_novos ->> 'nome' = 'Modelo Auditoria Teste' $$,
  $$ values ('INSERT'::text, 'e0000000-0000-0000-0000-000000000701'::text) $$,
  'INSERT em modelos_checklist grava operacao e o GESTOR como ator'
);

select is(
  (select dados_antigos ->> 'texto' from public.auditoria
    where tabela = 'perguntas_checklist' and operacao = 'UPDATE'
      and dados_novos ->> 'texto' = 'Pergunta editada'),
  'Pergunta original',
  'UPDATE em perguntas_checklist grava o texto antigo'
);

select is(
  (select registro_id from public.auditoria
    where tabela = 'modelos_checklist_grupos' and operacao = 'INSERT'),
  (select m.id::text || ':' || g.id::text
     from public.modelos_checklist m, public.grupos_sites g
    where m.nome = 'Modelo Auditoria Teste' and g.nome = 'Grupo Auditoria Modelos'),
  'modelos_checklist_grupos (chave composta) grava registro_id = "modelo:grupo"'
);

select ok(
  (select dados_novos is null and dados_antigos is not null from public.auditoria
    where tabela = 'modelos_checklist_grupos' and operacao = 'DELETE'),
  'DELETE da ligacao preserva a linha antiga e deixa dados_novos nulo'
);

select is(
  (select registro_id from public.auditoria
    where tabela = 'grupos_usuarios' and dados_novos ->> 'nome' = 'Grupo Usuarios Auditoria 0070'),
  (select id::text from public.grupos_usuarios where nome = 'Grupo Usuarios Auditoria 0070'),
  'tabela com id segue com registro_id = id (caminho sem argumento inalterado)'
);

select ok(
  not has_function_privilege('authenticated', 'public.registrar_auditoria()', 'EXECUTE'),
  'create or replace nao reabriu EXECUTE de registrar_auditoria para authenticated'
);

select * from finish();

rollback;
