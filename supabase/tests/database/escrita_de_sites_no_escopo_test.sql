-- ============================================================================
-- pgTAP — escopo de grupo na escrita de `sites` (migration 0032)
--
-- Um aviso de honestidade antes dos asserts, porque ele muda como ler este
-- arquivo: **o ramo novo da 0032 nao e exercitavel hoje**. O termo
-- acrescentado (`pode_ver_grupo_site(grupo_site_id)`) so nega alguem que
-- administre cadastro E tenha escopo restrito ao mesmo tempo, e isso nao
-- existe: `pode_administrar_cadastros()` e GESTOR/SUPERVISOR/OPERACIONAL,
-- `e_cliente()` e CLIENTE, e `cargo` guarda um valor so. A 0015 diz o mesmo
-- sobre `qr_codes` -- o termo esta la para a regra nao depender de os dois
-- conjuntos continuarem disjuntos por acidente.
--
-- Entao o que este arquivo prova e o que da para provar:
--
--   1) Estrutural: as duas policies realmente carregam o termo. Um refactor
--      futuro que "simplifique" a policy removendo a conjuncao passa a
--      quebrar aqui, que e o unico ponto onde a intencao da 0032 fica
--      registrada de forma executavel.
--   2) Regressao: quem nao e CLIENTE continua criando e editando site em
--      qualquer grupo, sem vinculo nenhum. Este e o lado que quebraria calado
--      -- `pode_ver_grupo_site()` devolve true para nao-CLIENTE, mas se
--      alguem inverter esse default a tela de Site / Planta para de salvar
--      para todo mundo.
--   3) Negativo que ja valia: CLIENTE segue sem escrever site.
--
-- Testar comportamentalmente o ramo novo exigiria um cargo que acumule as
-- duas condicoes. Quando/se ele existir, o assert comportamental entra aqui.
--
-- Executado (2026-08-18) direto contra o projeto Supabase de producao, dentro
-- de uma transacao com rollback, com o SQL da 0032 aplicado na mesma
-- transacao antes dos asserts. 8/8 asserts passaram; nada persistiu.
-- ============================================================================

begin;

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
values
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operacional.escopo@teste.local'),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cliente.escopo.sites@teste.local');

update public.profiles set ativo = true where id::text like 'e0000000%';
update public.profiles set cargo = 'OPERACIONAL' where id = 'e0000000-0000-0000-0000-000000000001';
update public.profiles set cargo = 'CLIENTE'     where id = 'e0000000-0000-0000-0000-000000000002';

insert into public.grupos_sites (nome) values ('Grupo escopo 0032 A'), ('Grupo escopo 0032 B');

-- O CLIENTE fica vinculado ao grupo A. Sem o vinculo ele nao enxergaria grupo
-- nenhum, e o assert negativo la embaixo passaria pelo motivo errado.
insert into public.grupos_sites_clientes (grupo_site_id, profile_id)
select id, 'e0000000-0000-0000-0000-000000000002'
from public.grupos_sites where nome = 'Grupo escopo 0032 A';

-- ---------------------------------------------------------------------------
-- 1) Estrutural: o termo esta nas duas policies
-- ---------------------------------------------------------------------------

select ok(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'sites'
      and policyname = 'Criacao de sites por quem administra') like '%pode_ver_grupo_site%',
  'policy de INSERT de sites exige alcance sobre o grupo de destino'
);

select ok(
  (select qual from pg_policies
    where schemaname = 'public' and tablename = 'sites'
      and policyname = 'Edicao de sites por quem administra') like '%pode_ver_grupo_site%',
  'policy de UPDATE de sites exige alcance sobre o grupo de origem (USING)'
);

-- `using` e `with check` separados de proposito: num UPDATE o primeiro enxerga
-- a linha antiga e o segundo a nova. So os dois juntos impedem empurrar um
-- site para um grupo que nao se alcanca -- e puxar um de la.
select ok(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'sites'
      and policyname = 'Edicao de sites por quem administra') like '%pode_ver_grupo_site%',
  'policy de UPDATE de sites exige alcance sobre o grupo de destino (WITH CHECK)'
);

-- Paridade com `qr_codes`, que e de onde o padrao veio (0015). Se um dia
-- alguem afrouxar a de la, o desalinhamento aparece aqui.
select ok(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'qr_codes'
      and policyname = 'Criacao de qr codes por quem administra') like '%pode_ver_grupo_site%',
  'qr_codes segue com o mesmo termo de escopo (0015), agora em paridade com sites'
);

-- ---------------------------------------------------------------------------
-- 2) Regressao: quem nao e CLIENTE nao sente diferenca nenhuma
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.sites (grupo_site_id, nome)
     select id, 'Site escopo A' from public.grupos_sites where nome = 'Grupo escopo 0032 A' $$,
  'OPERACIONAL cria site no grupo A sem vinculo nenhum'
);

select lives_ok(
  $$ insert into public.sites (grupo_site_id, nome)
     select id, 'Site escopo B' from public.grupos_sites where nome = 'Grupo escopo 0032 B' $$,
  'OPERACIONAL cria site no grupo B tambem -- o termo novo nao restringe nao-CLIENTE'
);

-- Move o site de um grupo para outro: e o unico caminho que passa pelo `using`
-- e pelo `with check` com valores diferentes.
select lives_ok(
  $$ update public.sites
        set grupo_site_id = (select id from public.grupos_sites where nome = 'Grupo escopo 0032 B')
      where nome = 'Site escopo A' $$,
  'OPERACIONAL move site entre grupos (USING no grupo antigo, WITH CHECK no novo)'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3) Negativo que ja valia antes da 0032, confirmado para nao afrouxar
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-0000-0000-000000000002", "role": "authenticated"}';

-- Barrado pelo primeiro termo (`pode_administrar_cadastros()`), nao pelo novo
-- -- o CLIENTE ate enxerga o grupo A. E o que torna o ramo novo inalcancavel
-- hoje, e esta registrado no cabecalho.
select throws_ok(
  $$ insert into public.sites (grupo_site_id, nome)
     select id, 'Site do cliente' from public.grupos_sites where nome = 'Grupo escopo 0032 A' $$,
  '42501',
  null,
  'CLIENTE nao cria site nem no grupo que enxerga'
);

reset role;

select * from finish();

rollback;
