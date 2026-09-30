-- ============================================================================
-- 0061 -- Modelos de checklist por grupo de sites
--
-- DECISAO DO DONO (30/09/2026): "perguntas diferentes por lugar". Ate aqui o
-- checklist de CONSULTORIA era UMA lista global (`perguntas_checklist`, com
-- `ordem` unica no banco inteiro): todo site respondia as mesmas perguntas.
--
-- O levantamento do sistema de referencia (fora do repositorio, porque tem
-- nome de cliente) mostrou como o checklist e usado de verdade:
--   - dezenas de modelos com nome, cada um com a sua lista de perguntas;
--   - todo modelo cobre exatamente os sites de UM grupo -- nenhum caso de
--     modelo atravessando grupos, nenhum de site pedindo modelo diferente do
--     resto do grupo. Por isso o vinculo e modelo <-> GRUPO, e nao por site;
--   - so um grupo usa dois modelos (o geral e um de limpeza): o app deixa o
--     inspetor escolher quando houver mais de um;
--   - so tres conjuntos de resposta: Conforme / Nao conforme / Nao se aplica
--     (quase tudo), Conforme / Nao conforme, e Sim / Nao ("Duvidas com o RH");
--   - cada pergunta aceita foto propria.
--
-- Escolhas confirmadas com o dono no mesmo dia:
--   - grupo sem modelo ligado usa o modelo PADRAO -- nasce aqui, com as
--     perguntas que ja existem;
--   - foto por pergunta entra junto (`checklist_fotos.pergunta_id`);
--   - a nota de 0 a 100 e calculada das respostas (packages/shared), nao
--     guardada -- nao ha o que ficar desencontrado.
--
-- A RESPOSTA NAO MUDA DE VALOR. `checklist_respostas.resposta` continua
-- 'SIM' / 'NAO' / 'NA'; o que muda e o ROTULO na tela, que segue o
-- `tipo_resposta` da pergunta (SIM e "Conforme" numa pergunta CNA e "Sim" numa
-- SN). Assim nenhum checklist ja enviado precisa ser reescrito.
--
-- TRANSICAO SEM QUEBRAR O QUE ESTA EM CAMPO. O APK 1.1.0 e a tela de perguntas
-- do painel nao conhecem modelo. Enquanto nao forem atualizados:
--   - pergunta gravada sem `modelo_id` cai no PADRAO (trigger);
--   - checklist de CONSULTORIA gravado sem `modelo_id` cai no PADRAO
--     (trigger) -- e o PADRAO e exatamente a lista que o app antigo mostra;
--   - `registrar_checklist` ganha dois parametros com default, entao a chamada
--     antiga, com seis argumentos, continua casando.
-- O que o app antigo NAO aguenta e a importacao dos modelos: ele le todas as
-- perguntas ativas, de todos os modelos. A importacao so roda depois de o app
-- novo chegar aos aparelhos (OTA).
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Modelos --------------------------------------------------------------------
-- `padrao` fora de qualquer grant: qual modelo e o padrao e decisao de
-- migration, nao de tela. O indice parcial garante que ha no maximo um, e o
-- check impede desligar o padrao -- sem ele, grupo sem modelo ficaria sem
-- checklist nenhum, que e o caso que o dono pediu para nao existir.

create table if not exists public.modelos_checklist (
  id bigint generated always as identity primary key,
  nome text not null,
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint modelos_checklist_nome_nao_vazio check (length(btrim(nome)) > 0),
  constraint modelos_checklist_padrao_ativo check (not padrao or ativo)
);

comment on table public.modelos_checklist is
  'Modelo de checklist de CONSULTORIA: um nome e a sua lista de perguntas.
   Liga-se a grupos de sites por `modelos_checklist_grupos`. O modelo com
   `padrao` vale para todo grupo sem modelo ligado. Migration 0061.';

create unique index if not exists modelos_checklist_nome_unico
  on public.modelos_checklist (lower(btrim(nome)));

create unique index if not exists modelos_checklist_um_padrao
  on public.modelos_checklist (padrao) where padrao;

alter table public.modelos_checklist enable row level security;

insert into public.modelos_checklist (nome, padrao)
select 'Padrão', true
where not exists (select 1 from public.modelos_checklist where padrao);

-- 2) Modelo <-> grupo de sites ---------------------------------------------------
-- Tabela de ligacao, e nao coluna `modelo_id` em `grupos_sites`: um grupo pode
-- ter mais de um modelo (o caso do "geral + limpeza"), e um modelo pode servir
-- mais de um grupo (modelos identicos foram juntados na importacao).
--
-- DELETE aqui e seguro, ao contrario das perguntas: desligar um modelo de um
-- grupo nao apaga historico -- o checklist enviado guarda o proprio `modelo_id`.

create table if not exists public.modelos_checklist_grupos (
  modelo_id bigint not null references public.modelos_checklist (id) on delete cascade,
  grupo_site_id bigint not null references public.grupos_sites (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (modelo_id, grupo_site_id)
);

comment on table public.modelos_checklist_grupos is
  'Quais grupos de sites respondem cada modelo de checklist. Grupo sem linha
   aqui usa o modelo padrao. Migration 0061.';

-- A PK cobre a busca por modelo; o app busca por grupo.
create index if not exists modelos_checklist_grupos_grupo_idx
  on public.modelos_checklist_grupos (grupo_site_id);

alter table public.modelos_checklist_grupos enable row level security;

-- 3) Perguntas passam a pertencer a um modelo -----------------------------------
-- `tipo_resposta`: CNA = Conforme/Nao conforme/Nao se aplica, CN = sem o
-- "Nao se aplica", SN = Sim/Nao. Check de texto e nao enum, pelo motivo de
-- `checklists_visita_tipo_check` (0042).

alter table public.perguntas_checklist
  add column if not exists modelo_id bigint references public.modelos_checklist (id) on delete restrict;

alter table public.perguntas_checklist
  add column if not exists tipo_resposta text not null default 'CNA';

alter table public.perguntas_checklist drop constraint if exists perguntas_checklist_tipo_resposta_check;
alter table public.perguntas_checklist
  add constraint perguntas_checklist_tipo_resposta_check
  check (tipo_resposta in ('CNA', 'CN', 'SN'));

update public.perguntas_checklist
   set modelo_id = (select id from public.modelos_checklist where padrao)
 where modelo_id is null;

alter table public.perguntas_checklist alter column modelo_id set not null;

-- A ordem passa a ser POR MODELO: dois modelos tem, cada um, a sua pergunta 1.
-- A unique nova comeca por `modelo_id`, entao serve tambem de indice da FK.
alter table public.perguntas_checklist drop constraint if exists perguntas_checklist_ordem_unica;
alter table public.perguntas_checklist drop constraint if exists perguntas_checklist_ordem_unica_no_modelo;
alter table public.perguntas_checklist
  add constraint perguntas_checklist_ordem_unica_no_modelo unique (modelo_id, ordem);

comment on column public.perguntas_checklist.tipo_resposta is
  'CNA (Conforme/Nao conforme/Nao se aplica), CN (sem Nao se aplica) ou SN
   (Sim/Nao). O valor gravado na resposta e sempre SIM/NAO/NA; o tipo so
   decide o rotulo e quais valores valem. Fixo depois de criada -- ver 0061.';

-- Grant por COLUNA. `modelo_id` e `tipo_resposta` entram no INSERT e ficam
-- fora do UPDATE, de proposito: mover uma pergunta ja respondida para outro
-- modelo, ou trocar o tipo dela, reinterpretaria respostas antigas (um SIM
-- gravado como "Conforme" passaria a ler "Sim"). Errou o tipo? Despublica e
-- cadastra outra -- o mesmo caminho que ja substitui o DELETE (0043).
revoke insert, update on public.perguntas_checklist from authenticated;
grant insert (modelo_id, ordem, texto, ativo, tipo_resposta)
  on public.perguntas_checklist to authenticated;
grant update (ordem, texto, ativo)
  on public.perguntas_checklist to authenticated;

-- 4) O checklist guarda o modelo respondido -------------------------------------
-- So a CONSULTORIA tem modelo; a CORRETIVA nao tem pergunta nenhuma. O check
-- vale nos dois sentidos, como o de `motivo` (0042).

alter table public.checklists_visita
  add column if not exists modelo_id bigint references public.modelos_checklist (id) on delete restrict;

-- Tudo o que foi respondido ate aqui foi a lista global, que agora e o PADRAO.
update public.checklists_visita
   set modelo_id = (select id from public.modelos_checklist where padrao)
 where tipo = 'CONSULTORIA' and modelo_id is null;

alter table public.checklists_visita drop constraint if exists checklists_visita_modelo_por_tipo;
alter table public.checklists_visita
  add constraint checklists_visita_modelo_por_tipo
  check ((tipo = 'CONSULTORIA') = (modelo_id is not null));

create index if not exists checklists_visita_modelo_idx
  on public.checklists_visita (modelo_id);

-- 5) Foto por pergunta -----------------------------------------------------------
-- Nula = foto do checklist inteiro, que e o que toda foto foi ate aqui (e o
-- que a CORRETIVA continua tendo).

alter table public.checklist_fotos
  add column if not exists pergunta_id bigint references public.perguntas_checklist (id) on delete restrict;

create index if not exists checklist_fotos_pergunta_idx
  on public.checklist_fotos (pergunta_id);

-- 6) Triggers --------------------------------------------------------------------
-- Em `manutencao`, fora da API, e `security definer`, como o
-- `validar_leitura_de_campo` da 0054: leem `modelos_checklist`/`perguntas`
-- sem depender do RLS de quem grava. Diferente daquele, valem para TODO papel
-- -- sao coerencia de dado, nao regra de sessao, e nenhuma escrita legitima
-- (importacao, seed, pgTAP) precisa furar.

create schema if not exists manutencao;

-- 6a) Sem modelo informado, o PADRAO. E o que mantem a tela de perguntas atual
-- do painel e o APK 1.1.0 funcionando ate serem atualizados (ver cabecalho).
create or replace function manutencao.pergunta_sem_modelo_vai_para_o_padrao()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if new.modelo_id is null then
    new.modelo_id := (select id from public.modelos_checklist where padrao);
  end if;
  return new;
end;
$$;

revoke all on function manutencao.pergunta_sem_modelo_vai_para_o_padrao() from public, anon, authenticated;

drop trigger if exists pergunta_sem_modelo_vai_para_o_padrao on public.perguntas_checklist;
create trigger pergunta_sem_modelo_vai_para_o_padrao
  before insert on public.perguntas_checklist
  for each row execute function manutencao.pergunta_sem_modelo_vai_para_o_padrao();

create or replace function manutencao.consultoria_sem_modelo_vai_para_o_padrao()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if new.tipo = 'CONSULTORIA' and new.modelo_id is null then
    new.modelo_id := (select id from public.modelos_checklist where padrao);
  end if;
  return new;
end;
$$;

revoke all on function manutencao.consultoria_sem_modelo_vai_para_o_padrao() from public, anon, authenticated;

drop trigger if exists consultoria_sem_modelo_vai_para_o_padrao on public.checklists_visita;
create trigger consultoria_sem_modelo_vai_para_o_padrao
  before insert on public.checklists_visita
  for each row execute function manutencao.consultoria_sem_modelo_vai_para_o_padrao();

-- 6b) A resposta e da pergunta do modelo respondido, e cabe no tipo dela.
-- Sem isto, um checklist do modelo A poderia carregar resposta de pergunta do
-- modelo B, e uma pergunta Sim/Nao poderia receber "Nao se aplica". 23514
-- (check_violation): e o que um check faria, se um check alcancasse outra
-- tabela.
create or replace function manutencao.validar_resposta_do_checklist()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_modelo_do_checklist bigint;
  v_modelo_da_pergunta bigint;
  v_tipo text;
begin
  -- Checklist ou pergunta inexistente: deixa passar para a FK responder, com
  -- a mensagem dela.
  select c.modelo_id into v_modelo_do_checklist
    from public.checklists_visita c where c.id = new.checklist_id;
  if not found then
    return new;
  end if;

  select p.modelo_id, p.tipo_resposta into v_modelo_da_pergunta, v_tipo
    from public.perguntas_checklist p where p.id = new.pergunta_id;
  if not found then
    return new;
  end if;

  if v_modelo_do_checklist is distinct from v_modelo_da_pergunta then
    raise exception 'A pergunta % nao pertence ao modelo do checklist %', new.pergunta_id, new.checklist_id
      using errcode = '23514';
  end if;

  if new.resposta = 'NA' and v_tipo <> 'CNA' then
    raise exception 'A pergunta % nao aceita "Nao se aplica"', new.pergunta_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function manutencao.validar_resposta_do_checklist() from public, anon, authenticated;

drop trigger if exists validar_resposta_do_checklist on public.checklist_respostas;
create trigger validar_resposta_do_checklist
  before insert on public.checklist_respostas
  for each row execute function manutencao.validar_resposta_do_checklist();

-- 6c) Foto de pergunta: a pergunta e do modelo do checklist.
create or replace function manutencao.validar_foto_do_checklist()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if new.pergunta_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.checklists_visita c
      join public.perguntas_checklist p on p.modelo_id = c.modelo_id
     where c.id = new.checklist_id
       and p.id = new.pergunta_id
  ) then
    raise exception 'A pergunta % nao pertence ao modelo do checklist %', new.pergunta_id, new.checklist_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function manutencao.validar_foto_do_checklist() from public, anon, authenticated;

drop trigger if exists validar_foto_do_checklist on public.checklist_fotos;
create trigger validar_foto_do_checklist
  before insert on public.checklist_fotos
  for each row execute function manutencao.validar_foto_do_checklist();

-- 7) Grants e policies dos cadastros novos ----------------------------------------
-- Tabela nova nao nasce com grant nenhum (0031). Mesma regua de
-- `perguntas_checklist` (0043): todo usuario ativo le -- o app baixa os modelos
-- antes de ir a campo --, e so `pode_administrar_cadastros()` escreve.
-- Sem DELETE de modelo: modelo respondido e historico; despublicar e
-- `ativo = false`.

grant select on public.modelos_checklist to authenticated;
grant insert (nome, ativo) on public.modelos_checklist to authenticated;
grant update (nome, ativo) on public.modelos_checklist to authenticated;

grant select, insert, delete on public.modelos_checklist_grupos to authenticated;

drop policy if exists "Leitura dos modelos para usuarios ativos" on public.modelos_checklist;
create policy "Leitura dos modelos para usuarios ativos" on public.modelos_checklist
  for select to authenticated
  using (autorizacao.usuario_ativo());

drop policy if exists "Gestao cadastra modelo de checklist" on public.modelos_checklist;
create policy "Gestao cadastra modelo de checklist" on public.modelos_checklist
  for insert to authenticated
  with check (autorizacao.pode_administrar_cadastros());

drop policy if exists "Gestao edita modelo de checklist" on public.modelos_checklist;
create policy "Gestao edita modelo de checklist" on public.modelos_checklist
  for update to authenticated
  using (autorizacao.pode_administrar_cadastros())
  with check (autorizacao.pode_administrar_cadastros());

drop policy if exists "Leitura dos grupos do modelo para usuarios ativos" on public.modelos_checklist_grupos;
create policy "Leitura dos grupos do modelo para usuarios ativos" on public.modelos_checklist_grupos
  for select to authenticated
  using (autorizacao.usuario_ativo());

drop policy if exists "Gestao liga modelo a grupo" on public.modelos_checklist_grupos;
create policy "Gestao liga modelo a grupo" on public.modelos_checklist_grupos
  for insert to authenticated
  with check (autorizacao.pode_administrar_cadastros());

drop policy if exists "Gestao desliga modelo de grupo" on public.modelos_checklist_grupos;
create policy "Gestao desliga modelo de grupo" on public.modelos_checklist_grupos
  for delete to authenticated
  using (autorizacao.pode_administrar_cadastros());

-- 7b) Troca dos grupos de um modelo, atomica -----------------------------------
-- Mesmo desenho de `sincronizar_membros_grupo_usuarios` (0026): apaga e
-- recria numa transacao so, para um INSERT que falhe depois do DELETE nao
-- deixar o modelo sem grupo nenhum -- que, aqui, mandaria os grupos dele
-- calados para o modelo padrao. `security invoker`: as policies acima sao o
-- portao, a funcao so garante a atomicidade.

create or replace function public.sincronizar_grupos_do_modelo(
  p_modelo_id bigint,
  p_grupos bigint[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.modelos_checklist_grupos where modelo_id = p_modelo_id;

  insert into public.modelos_checklist_grupos (modelo_id, grupo_site_id)
  select distinct p_modelo_id, g from unnest(coalesce(p_grupos, '{}')) as g;
end;
$$;

comment on function public.sincronizar_grupos_do_modelo(bigint, bigint[]) is
  'Substitui os grupos de sites de um modelo de checklist pelo conjunto
   informado, atomicamente. security invoker: a autorizacao e a policy de
   modelos_checklist_grupos. Migration 0061.';

revoke all on function public.sincronizar_grupos_do_modelo(bigint, bigint[]) from public, anon;
grant execute on function public.sincronizar_grupos_do_modelo(bigint, bigint[]) to authenticated;

-- 8) Envio atomico, agora com modelo e foto por pergunta ------------------------
-- Drop + create, e nao um segundo `create or replace` ao lado: duas versoes
-- da funcao (6 e 8 argumentos) fariam o PostgREST recusar a chamada antiga por
-- ambiguidade. Com uma so, e os dois argumentos novos com default, a chamada
-- de seis argumentos do APK 1.1.0 continua casando -- e cai no PADRAO pelo
-- trigger do passo 6a.
--
-- Continua `security invoker`, pelo motivo da 0042: atomicidade, nao
-- privilegio. Os triggers do passo 6 e as policies da 0059 seguem sendo o
-- portao.

drop function if exists public.registrar_checklist(bigint, text, text, text, text[], jsonb);

create or replace function public.registrar_checklist(
  p_visita_id bigint,
  p_tipo text,
  p_motivo text,
  p_assinatura_path text,
  p_fotos text[],
  p_respostas jsonb default '[]'::jsonb,
  p_modelo_id bigint default null,
  p_fotos_de_pergunta jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path, modelo_id)
  values (
    p_visita_id,
    p_tipo,
    nullif(btrim(coalesce(p_motivo, '')), ''),
    p_assinatura_path,
    -- Modelo so existe na CONSULTORIA; na CORRETIVA ele e ignorado aqui em
    -- vez de recusado pelo check -- o app manda o que a tela tem.
    case when p_tipo = 'CONSULTORIA' then p_modelo_id end
  )
  returning id into v_id;

  insert into public.checklist_fotos (checklist_id, storage_path)
  select v_id, f from unnest(coalesce(p_fotos, '{}')) as f;

  insert into public.checklist_respostas (checklist_id, pergunta_id, resposta, observacao)
  select
    v_id,
    (r ->> 'pergunta_id')::bigint,
    r ->> 'resposta',
    nullif(btrim(coalesce(r ->> 'observacao', '')), '')
  from jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb)) as r;

  insert into public.checklist_fotos (checklist_id, storage_path, pergunta_id)
  select v_id, f ->> 'storage_path', (f ->> 'pergunta_id')::bigint
  from jsonb_array_elements(coalesce(p_fotos_de_pergunta, '[]'::jsonb)) as f;

  return v_id;
end;
$$;

comment on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb) is
  'Envio do checklist em uma transacao. security INVOKER de proposito: as
   policies (0042/0059) e os triggers (0061) continuam sendo o portao -- a
   funcao existe por atomicidade, nao por privilegio. `p_modelo_id` e
   `p_fotos_de_pergunta` tem default para a chamada antiga, de seis
   argumentos, continuar valendo.';

revoke all on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb) from public, anon;
grant execute on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb) to authenticated;
