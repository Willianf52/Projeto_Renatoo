-- ============================================================================
-- 0086 -- Setor, Alerta de Panico e Tipo de Curva; minimos lidos pelo app
--
-- Campos do sistema de referencia que ficaram de fora da 0082/0083 por nao
-- terem nenhuma opcao cadastrada la (decisao do dono em 03/11/2026: entram
-- assim mesmo, com cadastro proprio):
--   - `setores`: o Setor do usuario e o Setor Responsavel do evento;
--   - `tipos_alerta_panico`: o "Tipo de Alerta de Panico" do usuario;
--   - `tipos_curva`: o "Tipo de Curva" do site.
-- As tres listas tem o formato dos Tipos de Analise (0071): Nome, Cor, Status.
--
-- E o app de campo passa a ler o cadastro do Cliente (0085), para aplicar o
-- "minimo de caracteres da descricao" na observacao de "Nao conforme": a
-- leitura abre para quem esta ativo (o cadastro nao tem dado sensivel; a
-- escrita continua so do GESTOR).
-- ============================================================================

-- 1) As tres listas -----------------------------------------------------------------

create table if not exists public.setores (
  id bigint generated always as identity primary key,
  nome text not null,
  cor text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint setores_nome_check check (length(btrim(nome)) between 1 and 100),
  constraint setores_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$')
);

create unique index if not exists setores_nome_unico on public.setores (lower(btrim(nome)));

comment on table public.setores is 'Setores do sistema de referencia (Nome, Cor, Status). Ver 0086.';

alter table public.setores enable row level security;
revoke all on public.setores from anon, authenticated;
grant select on public.setores to authenticated;
grant insert (nome, cor, ativo), update (nome, cor, ativo) on public.setores to authenticated;
grant all on public.setores to service_role;

drop policy if exists "Usuario ativo le setores" on public.setores;
create policy "Usuario ativo le setores" on public.setores
  for select to authenticated using ((select autorizacao.usuario_ativo()));

drop policy if exists "Gestor cadastra setores" on public.setores;
create policy "Gestor cadastra setores" on public.setores
  for insert to authenticated with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita setores" on public.setores;
create policy "Gestor edita setores" on public.setores
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

create table if not exists public.tipos_alerta_panico (
  id bigint generated always as identity primary key,
  nome text not null,
  cor text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tipos_alerta_panico_nome_check check (length(btrim(nome)) between 1 and 100),
  constraint tipos_alerta_panico_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$')
);

create unique index if not exists tipos_alerta_panico_nome_unico on public.tipos_alerta_panico (lower(btrim(nome)));

comment on table public.tipos_alerta_panico is 'Tipos de Alerta de Panico do sistema de referencia (Nome, Cor, Status). Ver 0086.';

alter table public.tipos_alerta_panico enable row level security;
revoke all on public.tipos_alerta_panico from anon, authenticated;
grant select on public.tipos_alerta_panico to authenticated;
grant insert (nome, cor, ativo), update (nome, cor, ativo) on public.tipos_alerta_panico to authenticated;
grant all on public.tipos_alerta_panico to service_role;

drop policy if exists "Usuario ativo le tipos_alerta_panico" on public.tipos_alerta_panico;
create policy "Usuario ativo le tipos_alerta_panico" on public.tipos_alerta_panico
  for select to authenticated using ((select autorizacao.usuario_ativo()));

drop policy if exists "Gestor cadastra tipos_alerta_panico" on public.tipos_alerta_panico;
create policy "Gestor cadastra tipos_alerta_panico" on public.tipos_alerta_panico
  for insert to authenticated with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita tipos_alerta_panico" on public.tipos_alerta_panico;
create policy "Gestor edita tipos_alerta_panico" on public.tipos_alerta_panico
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

create table if not exists public.tipos_curva (
  id bigint generated always as identity primary key,
  nome text not null,
  cor text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tipos_curva_nome_check check (length(btrim(nome)) between 1 and 100),
  constraint tipos_curva_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$')
);

create unique index if not exists tipos_curva_nome_unico on public.tipos_curva (lower(btrim(nome)));

comment on table public.tipos_curva is 'Tipos de Curva do sistema de referencia (Nome, Cor, Status). Ver 0086.';

alter table public.tipos_curva enable row level security;
revoke all on public.tipos_curva from anon, authenticated;
grant select on public.tipos_curva to authenticated;
grant insert (nome, cor, ativo), update (nome, cor, ativo) on public.tipos_curva to authenticated;
grant all on public.tipos_curva to service_role;

drop policy if exists "Usuario ativo le tipos_curva" on public.tipos_curva;
create policy "Usuario ativo le tipos_curva" on public.tipos_curva
  for select to authenticated using ((select autorizacao.usuario_ativo()));

drop policy if exists "Gestor cadastra tipos_curva" on public.tipos_curva;
create policy "Gestor cadastra tipos_curva" on public.tipos_curva
  for insert to authenticated with check ((select autorizacao.pode_administrar_usuarios()));

drop policy if exists "Gestor edita tipos_curva" on public.tipos_curva;
create policy "Gestor edita tipos_curva" on public.tipos_curva
  for update to authenticated
  using ((select autorizacao.pode_administrar_usuarios()))
  with check ((select autorizacao.pode_administrar_usuarios()));

-- 2) Os campos ----------------------------------------------------------------------

alter table public.profiles
  add column if not exists setor_id bigint references public.setores (id) on delete set null,
  add column if not exists alerta_panico_id bigint references public.tipos_alerta_panico (id) on delete set null;

-- O cadastro de usuarios grava pelo service_role, coluna a coluna (0058).
grant insert (setor_id, alerta_panico_id), update (setor_id, alerta_panico_id) on public.profiles to service_role;

alter table public.sites
  add column if not exists tipo_curva_id bigint references public.tipos_curva (id) on delete set null;

grant insert (tipo_curva_id), update (tipo_curva_id) on public.sites to authenticated;

alter table public.eventos
  add column if not exists setor_responsavel_id bigint references public.setores (id) on delete set null;

grant insert (setor_responsavel_id), update (setor_responsavel_id) on public.eventos to authenticated;

-- 3) salvar_evento grava o Setor Responsavel (mesma assinatura da 0083) ----------------

create or replace function public.salvar_evento(
  p_id bigint,
  p_nome text,
  p_descricao text,
  p_superior_id bigint,
  p_tempo_atendimento_minutos integer,
  p_bloqueio_repeticao_minutos integer,
  p_ativo boolean,
  p_sites bigint[] default '{}',
  p_emails text[] default '{}',
  p_extras jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_x jsonb := coalesce(p_extras, '{}'::jsonb);
begin
  if p_id is null then
    insert into public.eventos (nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo)
    values (p_nome, p_descricao, p_superior_id, p_tempo_atendimento_minutos, p_bloqueio_repeticao_minutos, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.eventos
       set nome = p_nome,
           descricao = p_descricao,
           superior_id = p_superior_id,
           tempo_atendimento_minutos = p_tempo_atendimento_minutos,
           bloqueio_repeticao_minutos = p_bloqueio_repeticao_minutos,
           ativo = coalesce(p_ativo, true)
     where id = p_id
    returning id into v_id;
    -- UPDATE barrado pelo RLS volta zero linhas, nao erro.
    if v_id is null then
      raise exception 'Evento inexistente ou sem permissão.' using errcode = '42501';
    end if;
  end if;

  -- Os campos da 0083, so quando vieram: um chamador antigo (sem `p_extras`)
  -- nao apaga o que o formulario novo gravou.
  if v_x <> '{}'::jsonb then
    update public.eventos
       set tempo_finalizacao_minutos = (v_x ->> 'tempo_finalizacao_minutos')::integer,
           status_final = nullif(v_x ->> 'status_final', ''),
           usuario_final_id = nullif(v_x ->> 'usuario_final_id', '')::uuid,
           responsavel_atendimento_id = nullif(v_x ->> 'responsavel_atendimento_id', '')::uuid,
           enviar_superior_imediato = coalesce((v_x ->> 'enviar_superior_imediato')::boolean, false),
           emails_copia = coalesce(array(select jsonb_array_elements_text(v_x -> 'emails_copia')), '{}'),
           prorrogacao_minutos = (v_x ->> 'prorrogacao_minutos')::integer,
           alarme = coalesce((v_x ->> 'alarme')::boolean, false),
           finalizacao_automatica = coalesce((v_x ->> 'finalizacao_automatica')::boolean, false),
           finalizacao_pela_ocorrencia_inicio = coalesce((v_x ->> 'finalizacao_pela_ocorrencia_inicio')::boolean, false),
           nps = nullif(v_x ->> 'nps', ''),
           tipo_classificacao_id = (v_x ->> 'tipo_classificacao_id')::bigint,
           grupo_responsavel_id = (v_x ->> 'grupo_responsavel_id')::bigint,
           setor_responsavel_id = (v_x ->> 'setor_responsavel_id')::bigint
     where id = v_id;
  end if;

  delete from public.eventos_sites s
   where s.evento_id = v_id
     and not (s.site_id = any (coalesce(p_sites, '{}')));
  insert into public.eventos_sites (evento_id, site_id)
  select v_id, unnest(coalesce(p_sites, '{}'))
  on conflict do nothing;

  insert into public.eventos_notificacoes (evento_id, emails)
  values (v_id, coalesce(p_emails, '{}'))
  on conflict (evento_id) do update set emails = excluded.emails;

  return v_id;
end;
$$;

-- 4) O app le os minimos do Cliente ------------------------------------------------------

drop policy if exists "Usuario ativo le o cliente" on public.cliente;
create policy "Usuario ativo le o cliente" on public.cliente
  for select to authenticated using ((select autorizacao.usuario_ativo()));
