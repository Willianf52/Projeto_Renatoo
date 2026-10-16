-- ============================================================================
-- 0073 — Editor de checklist e Grupo de Perguntas
--
-- Issue #209 (menu ChecklistLab > Administracao do GESTOR no sistema de
-- referencia, lido em 16/10/2026). Revê a decisao de 01/10 (#155), que tirou
-- do painel as telas de modelos e perguntas: o dono quer editar checklist pelo
-- portal, como la.
--
-- GRUPO DE PERGUNTAS. La e um cadastro de Ordem, Grupo, Cor e Status (80
-- grupos, 71 ativos), e cada pergunta do checklist aponta para um grupo -- a
-- coluna "Grupo" da lista de perguntas. Aqui:
--   - `grupos_perguntas` (nome unico, cor #RRGGBB, ordem, ativo);
--   - `perguntas_checklist.grupo_pergunta_id`, opcional: as 743 perguntas de
--     hoje ficam sem grupo ate alguem escolher.
-- Mesma regua de escrita das perguntas (0043/0061): `pode_administrar_cadastros()`.
-- Leitura de todo usuario ativo, como as perguntas: o app de campo pode
-- mostrar o grupo um dia sem migration nova.
--
-- PERGUNTAS. Dois grants que faltavam para o editor:
--   - `evento_id` (0063, o tipo de evento que a resposta abre): entrou por
--     script, sem grant. Trocar o tipo de evento NAO reinterpreta o que ja foi
--     respondido -- a ocorrencia guarda o proprio `evento_id` --, entao vai
--     no INSERT e no UPDATE;
--   - `grupo_pergunta_id`, idem.
-- `modelo_id` e `tipo_resposta` seguem so no INSERT (0061): mover ou retipar
-- pergunta ja respondida reinterpretaria as respostas antigas.
--
-- REORDENAR. `ordem` e unica no modelo, sem `deferrable`; trocar duas de
-- lugar pela API exigiria tres UPDATEs com uma ordem provisoria no meio, e uma
-- falha entre eles deixaria a pergunta fora do lugar. `mover_pergunta` faz a
-- troca com a vizinha numa transacao. `security invoker`: atomicidade, nao
-- privilegio -- a policy de UPDATE continua sendo o portao.
--
-- DUPLICAR. "Duplicar Checklist" da referencia: `duplicar_modelo` copia nome
-- novo e todas as perguntas (com tipo, evento, grupo e status), numa
-- transacao. Sem os grupos de sites -- o duplicado nasce para OUTRO lugar, e
-- herdar os grupos faria os dois modelos disputarem o mesmo site.
--
-- Idempotente e transacional (convencao da 0041).
-- ============================================================================

-- 1) Grupo de perguntas -------------------------------------------------------------

create table if not exists public.grupos_perguntas (
  id bigint generated always as identity primary key,
  nome text not null,
  cor text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint grupos_perguntas_nome_check check (length(btrim(nome)) between 1 and 100),
  constraint grupos_perguntas_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$'),
  constraint grupos_perguntas_ordem_check check (ordem between 0 and 9999)
);

create unique index if not exists grupos_perguntas_nome_unico on public.grupos_perguntas (lower(btrim(nome)));

alter table public.grupos_perguntas enable row level security;

revoke all on public.grupos_perguntas from anon, authenticated;
grant select on public.grupos_perguntas to authenticated;
grant insert (nome, cor, ordem, ativo), update (nome, cor, ordem, ativo) on public.grupos_perguntas to authenticated;
grant all on public.grupos_perguntas to service_role;

drop policy if exists "Leitura dos grupos de perguntas para usuarios ativos" on public.grupos_perguntas;
create policy "Leitura dos grupos de perguntas para usuarios ativos" on public.grupos_perguntas
  for select to authenticated
  using ((select autorizacao.usuario_ativo()));

drop policy if exists "Gestao cadastra grupo de perguntas" on public.grupos_perguntas;
create policy "Gestao cadastra grupo de perguntas" on public.grupos_perguntas
  for insert to authenticated
  with check ((select autorizacao.pode_administrar_cadastros()));

drop policy if exists "Gestao edita grupo de perguntas" on public.grupos_perguntas;
create policy "Gestao edita grupo de perguntas" on public.grupos_perguntas
  for update to authenticated
  using ((select autorizacao.pode_administrar_cadastros()))
  with check ((select autorizacao.pode_administrar_cadastros()));

drop trigger if exists auditoria_trigger on public.grupos_perguntas;
create trigger auditoria_trigger
  after insert or update or delete on public.grupos_perguntas
  for each row execute function public.registrar_auditoria();

-- 2) Pergunta: grupo e os grants do editor -----------------------------------------

alter table public.perguntas_checklist
  add column if not exists grupo_pergunta_id bigint references public.grupos_perguntas (id) on delete restrict;

create index if not exists perguntas_checklist_grupo_idx on public.perguntas_checklist (grupo_pergunta_id);

grant insert (evento_id, grupo_pergunta_id), update (evento_id, grupo_pergunta_id)
   on public.perguntas_checklist to authenticated;

-- 3) Reordenar ---------------------------------------------------------------------

create or replace function public.mover_pergunta(p_pergunta_id bigint, p_para_cima boolean)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_atual record;
  v_vizinha record;
begin
  -- Primeiro a permissao: sem ela o `for update` abaixo nem acha a linha (a
  -- policy de UPDATE tambem filtra), e a recusa sairia como "inexistente".
  if not autorizacao.pode_administrar_cadastros() then
    raise exception 'Sem permissão para reordenar.' using errcode = '42501';
  end if;

  select id, modelo_id, ordem into v_atual
    from public.perguntas_checklist
   where id = p_pergunta_id
   for update;
  if v_atual.id is null then
    raise exception 'Pergunta inexistente.' using errcode = '23514';
  end if;

  -- A vizinha mais proxima na direcao pedida, ativa ou nao: a ordem e do
  -- modelo inteiro, e pular as inativas faria a troca "atravessar" uma delas.
  select id, ordem into v_vizinha
    from public.perguntas_checklist
   where modelo_id = v_atual.modelo_id
     and (case when p_para_cima then ordem < v_atual.ordem else ordem > v_atual.ordem end)
   order by case when p_para_cima then -ordem else ordem end
   limit 1
   for update;
  -- Ja na ponta: nada a fazer, e nao e erro.
  if v_vizinha.id is null then
    return;
  end if;

  -- Ordem provisoria fora da faixa da tela (1..9999) para nao bater no
  -- unique (modelo_id, ordem) no meio da troca.
  update public.perguntas_checklist set ordem = -1 where id = v_atual.id;
  update public.perguntas_checklist set ordem = v_atual.ordem where id = v_vizinha.id;
  update public.perguntas_checklist set ordem = v_vizinha.ordem where id = v_atual.id;

  -- UPDATE barrado pelo RLS volta zero linhas, nao erro: confere o resultado.
  if not exists (select 1 from public.perguntas_checklist where id = v_atual.id and ordem = v_vizinha.ordem) then
    raise exception 'Sem permissão para reordenar.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.mover_pergunta(bigint, boolean) is
  'Troca a pergunta de lugar com a vizinha (acima ou abaixo) no mesmo modelo,
   numa transacao. security invoker: a policy de UPDATE e o portao. 0073.';

revoke all on function public.mover_pergunta(bigint, boolean) from public, anon;
grant execute on function public.mover_pergunta(bigint, boolean) to authenticated;

-- 4) Duplicar modelo ----------------------------------------------------------------

create or replace function public.duplicar_modelo(p_modelo_id bigint, p_nome text)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.modelos_checklist where id = p_modelo_id) then
    raise exception 'Modelo inexistente.' using errcode = '23514';
  end if;

  -- Nasce ativo e sem grupos: so passa a valer quando alguem ligar a um grupo.
  insert into public.modelos_checklist (nome, ativo)
  values (btrim(p_nome), true)
  returning id into v_id;

  insert into public.perguntas_checklist (modelo_id, ordem, texto, tipo_resposta, evento_id, grupo_pergunta_id, ativo)
  select v_id, p.ordem, p.texto, p.tipo_resposta, p.evento_id, p.grupo_pergunta_id, p.ativo
    from public.perguntas_checklist p
   where p.modelo_id = p_modelo_id;

  return v_id;
end;
$$;

comment on function public.duplicar_modelo(bigint, text) is
  'Duplicar Checklist: modelo novo com todas as perguntas do original, sem os
   grupos de sites, numa transacao. security invoker: as policies de INSERT
   sao o portao. 0073.';

revoke all on function public.duplicar_modelo(bigint, text) from public, anon;
grant execute on function public.duplicar_modelo(bigint, text) to authenticated;
