-- ============================================================================
-- 0090: assinaturas do checklist com nome de quem assinou
--
-- POR QUE EXISTE (04/11/2026): o antigo colhe DUAS assinaturas por checklist e
-- pede o nome de cada pessoa antes de ela assinar; o PDF mostra a imagem com
-- "Assinado por <nome>" embaixo. Aqui o checklist guardava UMA assinatura, sem
-- nome (`checklists_visita.assinatura_path`).
--
-- O QUE FAZ:
--   1. Tabela `checklist_assinaturas` (checklist, ordem, nome, caminho).
--   2. `registrar_checklist` ganha `p_assinaturas` (default vazio), e a chamada
--      antiga, sem ele, continua valendo: nesse caso grava UMA linha com o
--      `p_assinatura_path` e sem nome (o "Novo Checklist" do portal e o app
--      1.1.0 seguem assim).
--   3. Os checklists que ja existem ganham a linha 1, sem nome.
--
-- `checklists_visita.assinatura_path` FICA, com o caminho da assinatura 1: ele
-- e `not null`, e tudo que le "a assinatura" do checklist continua
-- funcionando. A fonte para exibir passa a ser a tabela nova.
--
-- Quantas assinaturas o checklist exige NAO e regra do banco: o app de campo
-- exige duas, e o checklist feito no portal tem uma.
-- ============================================================================

-- 1) Tabela ------------------------------------------------------------------

create table if not exists public.checklist_assinaturas (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references public.checklists_visita (id) on delete cascade,
  ordem smallint not null,
  -- Nulo nos checklists antigos e nos do portal, que nunca pediram o nome.
  nome text,
  storage_path text not null,
  criado_em timestamptz not null default now(),
  constraint checklist_assinaturas_ordem_valida check (ordem between 1 and 5),
  constraint checklist_assinaturas_ordem_unica unique (checklist_id, ordem),
  constraint checklist_assinaturas_path_unico unique (storage_path),
  constraint checklist_assinaturas_nome_valido
    check (nome is null or (length(btrim(nome)) > 0 and length(nome) <= 120)),
  constraint checklist_assinaturas_path_nao_vazio check (length(btrim(storage_path)) > 0)
);

alter table public.checklist_assinaturas enable row level security;

create index if not exists checklist_assinaturas_checklist_idx
  on public.checklist_assinaturas (checklist_id);

comment on table public.checklist_assinaturas is
  'Assinaturas de um checklist, na ordem em que foram colhidas, cada uma com o
   nome de quem assinou (0090). `storage_path` mora na pasta da visita, no
   bucket `checklists`, como as fotos e a assinatura da 0042.';

grant select, insert on public.checklist_assinaturas to authenticated;
revoke update, delete, truncate on public.checklist_assinaturas from authenticated;

-- 2) Policies ----------------------------------------------------------------
-- Mesmo desenho de `checklist_fotos` (0042/0059): leitura pelo escopo da
-- visita, escrita por quem pode finalizar a visita, com o caminho amarrado a
-- pasta dela.

drop policy if exists "Leitura das assinaturas no escopo" on public.checklist_assinaturas;
create policy "Leitura das assinaturas no escopo" on public.checklist_assinaturas
  for select to authenticated
  using (exists (
    select 1 from public.checklists_visita c
    where c.id = checklist_assinaturas.checklist_id and autorizacao.pode_ver_visita(c.visita_id)
  ));

drop policy if exists "Quem finaliza a visita grava as assinaturas" on public.checklist_assinaturas;
create policy "Quem finaliza a visita grava as assinaturas" on public.checklist_assinaturas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklists_visita c
      where c.id = checklist_assinaturas.checklist_id
        and autorizacao.pode_finalizar_visita(c.visita_id)
        and checklist_assinaturas.storage_path like (c.visita_id::text || '/%')
    )
  );

-- 3) Quem ja existe ------------------------------------------------------------

insert into public.checklist_assinaturas (checklist_id, ordem, nome, storage_path)
select c.id, 1, null, c.assinatura_path
from public.checklists_visita c
on conflict (checklist_id, ordem) do nothing;

-- 4) Envio -------------------------------------------------------------------
-- Mais um argumento com default: a chamada de 8 argumentos (app 1.1.0 e o
-- portal) continua casando. Continua `security invoker`, pelo motivo da 0042:
-- atomicidade, nao privilegio; as policies sao o portao.
--
-- `p_assinaturas`: [{"nome": "Willian", "storage_path": "12/assinatura-ab.png"}, ...]
-- na ordem em que foram colhidas. Vazio ou ausente: uma linha com
-- `p_assinatura_path` e sem nome.

drop function if exists public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb);

create or replace function public.registrar_checklist(
  p_visita_id bigint,
  p_tipo text,
  p_motivo text,
  p_assinatura_path text,
  p_fotos text[],
  p_respostas jsonb default '[]'::jsonb,
  p_modelo_id bigint default null,
  p_fotos_de_pergunta jsonb default '[]'::jsonb,
  p_assinaturas jsonb default '[]'::jsonb
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

  if jsonb_typeof(coalesce(p_assinaturas, '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(p_assinaturas, '[]'::jsonb)) > 0 then
    insert into public.checklist_assinaturas (checklist_id, ordem, nome, storage_path)
    select
      v_id,
      (a.indice)::smallint,
      nullif(btrim(coalesce(a.item ->> 'nome', '')), ''),
      a.item ->> 'storage_path'
    from jsonb_array_elements(p_assinaturas) with ordinality as a(item, indice);
  else
    insert into public.checklist_assinaturas (checklist_id, ordem, nome, storage_path)
    values (v_id, 1, null, p_assinatura_path);
  end if;

  return v_id;
end;
$$;

comment on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb, jsonb) is
  'Envio do checklist em uma transacao. security INVOKER de proposito: as
   policies (0042/0059) e os triggers (0061) continuam sendo o portao -- a
   funcao existe por atomicidade, nao por privilegio. `p_modelo_id`,
   `p_fotos_de_pergunta` e `p_assinaturas` tem default para as chamadas
   antigas continuarem valendo (0090).';

revoke all on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_checklist(bigint, text, text, text, text[], jsonb, bigint, jsonb, jsonb) to authenticated;
