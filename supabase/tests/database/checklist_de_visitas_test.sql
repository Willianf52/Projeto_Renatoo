-- ============================================================================
-- pgTAP — checklist de visitas (migration 0042)
--
-- Cobre o que a migration abre e o que ela fecha:
--
--   1) INSPETOR grava checklist CONSULTORIA da própria visita, com resposta
--      e foto -- sucesso.
--   2) INSPETOR não grava checklist numa visita que não é sua -- nega.
--   3) CORRETIVA sem motivo é recusada pelo check, não pela tela -- nega.
--   4) CONSULTORIA *com* motivo também é recusada (o check vale nos dois
--      sentidos, senão o app poderia gravar motivo onde ele não existe).
--   5) Uma visita não recebe dois checklists (unique) -- nega o reenvio.
--   6) INSPETOR não pendura resposta em checklist de outro inspetor -- nega.
--   7) INSPETOR inativo não grava checklist -- nega (`usuario_ativo()` entra
--      na conjunção de `e_inspetor()`).
--   8) CLIENTE do grupo do site **lê** o checklist, mesmo sem tê-lo criado --
--      confirma que `pode_ver_visita()` espelha mesmo a policy da 0014.
--   9) CLIENTE de outro grupo não lê nada -- o recorte não vaza.
--  10) `authenticated` não tem UPDATE nem DELETE nas tabelas novas -- o
--      segundo portão do passo 6 da migration.
--  11) `registrar_checklist` grava as três tabelas numa chamada só, colapsa
--      motivo vazio em `null` e apara a observação.
--
-- Ids de linha alheia são capturados numa tabela temporária SEM RLS antes de
-- trocar de role e usados como literal -- ver a nota no
-- `escrita_de_campo_por_inspetor_test.sql`: sem isso a policy de SELECT filtra
-- a linha antes do INSERT tentar, e o teste passa pelo motivo errado.
--
-- Executado (2026-08-26) direto contra o projeto Supabase de produção, dentro
-- de uma transação com rollback -- branch de desenvolvimento não está
-- disponível no plano atual. Os asserts 1-10 rodaram junto do DDL da 0042 na
-- mesma transação, ANTES de a migration ser aplicada (é o ensaio que a seção 7
-- da skill `supabase-rls-security` exige); o 11 rodou logo depois de aplicar.
-- 11/11 passaram; nada persistiu.
--
-- ATENÇÃO ao escrever assert novo que chame `registrar_checklist`: a chamada
-- precisa ser um statement próprio. Chamá-la dentro do `where` de um `select`
-- que conta as linhas inseridas devolve 0 -- o snapshot do `select` é anterior
-- ao insert que a função faz. Custou um "not ok" na primeira tentativa.
-- ============================================================================

begin;

select plan(12);

create temporary table ids_teste (chave text primary key, valor bigint);
grant select, insert on ids_teste to public;

-- Fixture ---------------------------------------------------------------------
-- Dois INSPETOR, um INSPETOR inativo, dois CLIENTE (um de cada grupo), e dois
-- grupos de sites para o recorte do cliente ter o que separar.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('f0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.inspetor.a@teste.local'),
  ('f0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.inspetor.b@teste.local'),
  ('f0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.inspetor.inativo@teste.local'),
  ('f0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.cliente.dentro@teste.local'),
  ('f0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk.cliente.fora@teste.local');

update public.profiles set ativo = true, cargo = 'INSPETOR'
  where id in ('f0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000012');
update public.profiles set ativo = false, cargo = 'INSPETOR'
  where id = 'f0000000-0000-0000-0000-000000000013';
update public.profiles set ativo = true, cargo = 'CLIENTE'
  where id in ('f0000000-0000-0000-0000-000000000014', 'f0000000-0000-0000-0000-000000000015');

insert into public.grupos_sites (nome) values ('Grupo Checklist Dentro'), ('Grupo Checklist Fora');

insert into public.sites (grupo_site_id, nome)
  select id, 'Site Checklist' from public.grupos_sites where nome = 'Grupo Checklist Dentro';

insert into public.grupos_sites_clientes (grupo_site_id, profile_id)
  select id, 'f0000000-0000-0000-0000-000000000014' from public.grupos_sites where nome = 'Grupo Checklist Dentro';
insert into public.grupos_sites_clientes (grupo_site_id, profile_id)
  select id, 'f0000000-0000-0000-0000-000000000015' from public.grupos_sites where nome = 'Grupo Checklist Fora';

insert into public.perguntas_checklist (ordem, texto) values (1, 'Pergunta de teste 1');

insert into ids_teste (chave, valor)
  select 'site', id from public.sites where nome = 'Site Checklist';
insert into ids_teste (chave, valor)
  select 'pergunta', id from public.perguntas_checklist where texto = 'Pergunta de teste 1';

-- ---------------------------------------------------------------------------
-- 1) INSPETOR A grava CONSULTORIA da própria visita, com resposta e foto.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000011", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9101, s.id, 'f0000000-0000-0000-0000-000000000011'
  from public.sites s where s.nome = 'Site Checklist';

insert into public.checklists_visita (visita_id, tipo, assinatura_path)
  select v.id, 'CONSULTORIA', v.id || '/assinatura.png'
  from public.visitas v where v.numero_coleta = 9101;

insert into public.checklist_respostas (checklist_id, pergunta_id, resposta)
  select c.id, p.id, 'SIM'
  from public.checklists_visita c
  join public.visitas v on v.id = c.visita_id
  cross join public.perguntas_checklist p
  where v.numero_coleta = 9101 and p.ordem = 1;

insert into public.checklist_fotos (checklist_id, storage_path)
  select c.id, c.visita_id || '/foto-1.jpg'
  from public.checklists_visita c
  join public.visitas v on v.id = c.visita_id
  where v.numero_coleta = 9101;

select is(
  (select count(*)::int
     from public.checklist_respostas r
     join public.checklists_visita c on c.id = r.checklist_id
     join public.visitas v on v.id = c.visita_id
    where v.numero_coleta = 9101),
  1,
  'INSPETOR grava checklist, resposta e foto da propria visita'
);

reset role;

insert into ids_teste (chave, valor) select 'visita_a', id from public.visitas where numero_coleta = 9101;
insert into ids_teste (chave, valor)
  select 'checklist_a', c.id from public.checklists_visita c
  join public.visitas v on v.id = c.visita_id where v.numero_coleta = 9101;

-- ---------------------------------------------------------------------------
-- 2) INSPETOR B não grava checklist na visita do INSPETOR A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000012", "role": "authenticated"}';

-- O caminho da assinatura precisa ser bem formado (`{visita_id}/...`) desde a
-- 0045, senao o check `checklists_visita_assinatura_na_pasta_da_visita` recusa
-- antes -- e o assert passaria pelo codigo errado, testando a constraint em vez
-- da policy. `%1$s` reusa o mesmo id do `%1$L`.
select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
       values (%1$L, 'CORRETIVA', 'invadindo', '%1$s/x.png') $$,
    (select valor from ids_teste where chave = 'visita_a')
  ),
  '42501',
  null,
  'INSPETOR nao grava checklist em visita que nao e sua'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3) CORRETIVA sem motivo é recusada pelo check (23514), não pela tela.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000012", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  select 9102, s.id, 'f0000000-0000-0000-0000-000000000012'
  from public.sites s where s.id = (select valor from ids_teste where chave = 'site');

select throws_ok(
  $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
     select v.id, 'CORRETIVA', null, v.id || '/a.png'
     from public.visitas v where v.numero_coleta = 9102 $$,
  '23514',
  null,
  'CORRETIVA sem motivo e recusada pelo check do banco'
);

-- ---------------------------------------------------------------------------
-- 4) CONSULTORIA com motivo também é recusada -- o check vale nos dois lados.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
     select v.id, 'CONSULTORIA', 'nao deveria caber', v.id || '/a.png'
     from public.visitas v where v.numero_coleta = 9102 $$,
  '23514',
  null,
  'CONSULTORIA com motivo e recusada pelo check do banco'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5) Uma visita não recebe dois checklists (reenvio do app sem sinal).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000011", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, assinatura_path)
       values (%1$L, 'CONSULTORIA', '%1$s/y.png') $$,
    (select valor from ids_teste where chave = 'visita_a')
  ),
  '23505',
  null,
  'Reenvio nao cria um segundo checklist para a mesma visita'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6) INSPETOR B não pendura resposta no checklist do INSPETOR A.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000012", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklist_respostas (checklist_id, pergunta_id, resposta)
       values (%L, %L, 'NAO') $$,
    (select valor from ids_teste where chave = 'checklist_a'),
    (select valor from ids_teste where chave = 'pergunta')
  ),
  '42501',
  null,
  'INSPETOR nao pendura resposta em checklist alheio'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7) INSPETOR inativo não grava checklist.
-- ---------------------------------------------------------------------------
-- A visita é criada com `service_role` (sem role trocada): o inspetor inativo
-- também não conseguiria criá-la, e o que está sob teste aqui é a policy do
-- checklist, não a da visita.
insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values (9103, (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000013');
insert into ids_teste (chave, valor) select 'visita_inativo', id from public.visitas where numero_coleta = 9103;

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000013", "role": "authenticated"}';

select throws_ok(
  format(
    $$ insert into public.checklists_visita (visita_id, tipo, assinatura_path)
       values (%1$L, 'CONSULTORIA', '%1$s/a.png') $$,
    (select valor from ids_teste where chave = 'visita_inativo')
  ),
  '42501',
  null,
  'INSPETOR inativo nao grava checklist'
);

reset role;

-- ---------------------------------------------------------------------------
-- 8) CLIENTE do grupo do site lê o checklist que não criou.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000014", "role": "authenticated"}';

select is(
  (select count(*)::int from public.checklists_visita
    where visita_id = (select valor from ids_teste where chave = 'visita_a')),
  1,
  'CLIENTE do grupo le o checklist da visita no escopo dele'
);

reset role;

-- ---------------------------------------------------------------------------
-- 9) CLIENTE de outro grupo não lê nada.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000015", "role": "authenticated"}';

select is(
  (select count(*)::int from public.checklists_visita),
  0,
  'CLIENTE de outro grupo nao le checklist nenhum'
);

reset role;

-- ---------------------------------------------------------------------------
-- 10) `authenticated` não tem UPDATE nem DELETE nas tabelas de campo.
-- ---------------------------------------------------------------------------
-- `perguntas_checklist` saiu desta lista na 0043: cadastro operacional grava
-- com o token da própria pessoa, como `grupos_sites` e `sites`. O grant de
-- UPDATE que ela ganhou é conferido logo abaixo, junto do DELETE que continua
-- revogado. As três tabelas de campo seguem sem escrita corretiva: uma
-- resposta de inspeção não se edita depois de gravada.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name in ('checklists_visita', 'checklist_respostas', 'checklist_fotos')
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'authenticated nao tem UPDATE/DELETE/TRUNCATE nas tabelas de campo do checklist'
);

-- ---------------------------------------------------------------------------
-- 10b) Em `perguntas_checklist`, a 0043 abriu UPDATE e manteve DELETE fechado.
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '')
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'perguntas_checklist'
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')),
  'UPDATE',
  'perguntas_checklist da UPDATE a authenticated, mas nao DELETE nem TRUNCATE'
);

-- ---------------------------------------------------------------------------
-- 11) `registrar_checklist` grava as três tabelas numa chamada só.
-- ---------------------------------------------------------------------------
-- A chamada é um statement próprio (o `insert into ids_teste ... select`), e
-- não uma subconsulta do assert -- ver a nota no cabeçalho.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-0000-0000-000000000011", "role": "authenticated"}';

insert into public.visitas (numero_coleta, site_id, funcionario_id)
  values (9104, (select valor from ids_teste where chave = 'site'), 'f0000000-0000-0000-0000-000000000011');

-- `visita_rpc` guarda o id de verdade (identity), não o numero_coleta 9104
-- usado acima -- os dois divergem, e desde a 0045 o caminho da mídia precisa
-- do id real: é o que o check `checklists_visita_assinatura_na_pasta_da_visita`
-- e a policy de `checklist_fotos` conferem.
insert into ids_teste (chave, valor)
  select 'visita_rpc', id from public.visitas where numero_coleta = 9104;

insert into ids_teste (chave, valor)
select 'checklist_rpc', public.registrar_checklist(
  (select valor from ids_teste where chave = 'visita_rpc'),
  'CONSULTORIA',
  -- String vazia, e não `null`: é a forma que o app envia (o gerador de tipos
  -- marca o argumento como não-nulo). O `nullif` da função colapsa as duas.
  '',
  format('%s/assinatura.png', (select valor from ids_teste where chave = 'visita_rpc')),
  array[
    format('%s/foto-a.jpg', (select valor from ids_teste where chave = 'visita_rpc')),
    format('%s/foto-b.jpg', (select valor from ids_teste where chave = 'visita_rpc'))
  ],
  jsonb_build_array(jsonb_build_object(
    'pergunta_id', (select valor from ids_teste where chave = 'pergunta'),
    'resposta', 'NA',
    'observacao', '  nao ha portao aqui  '))
);

select is(
  (select format('%s/%s/%s/%s/%s',
     (select count(*) from public.checklists_visita c where c.id = r.valor),
     (select count(*) from public.checklist_fotos f where f.checklist_id = r.valor),
     (select count(*) from public.checklist_respostas p where p.checklist_id = r.valor),
     (select c.motivo is null from public.checklists_visita c where c.id = r.valor),
     coalesce((select p.observacao from public.checklist_respostas p where p.checklist_id = r.valor), '-'))
   from ids_teste r where r.chave = 'checklist_rpc'),
  '1/2/1/t/nao ha portao aqui',
  'registrar_checklist grava checklist, fotos e respostas, com motivo nulo e observacao aparada'
);

reset role;

select * from finish();

rollback;
