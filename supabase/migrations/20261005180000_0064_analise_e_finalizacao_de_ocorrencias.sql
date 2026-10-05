-- ============================================================================
-- 0064 -- Analise e finalizacao das ocorrencias
--
-- ITEM 5 DO PLANO DA #164 (05/10/2026), primeira metade. No sistema de
-- referencia cada ocorrencia (0063) pode receber ANALISES e, no fim, uma
-- FINALIZACAO ("Acoes Realizadas"), com responsavel, grupo, usuarios de apoio,
-- anexos e aviso. O que o formulario faz com o status nao da para observar sem
-- enviar um (nenhuma das 789 de 2026 passou por ele); a regra abaixo e a
-- decidida com o dono:
--
--   - a primeira analise leva AGUARDANDO -> EM_ANALISE (CRITICO fica CRITICO);
--   - a finalizacao leva a ATENDIDO e grava `finalizada_em` -- e de la que sai
--     o Tempo Medio de Resolucao (segunda metade do item 5);
--   - finalizar vale uma vez, e ocorrencia ATENDIDA ou CANCELADA nao recebe
--     mais nada.
--
-- QUEM ESCREVE: quem ve toda a operacao (`autorizacao.pode_ver_toda_operacao`:
-- GESTOR e SUPERVISOR), e so em ocorrencia que pode ver. INSPETOR le o
-- historico das proprias ocorrencias, mas nao analisa nem finaliza. Ninguem
-- altera nem apaga andamento: e historico.
--
-- COMO O STATUS MUDA: pelo trigger, `security definer` em `manutencao`, como
-- o que abre a ocorrencia (0063) -- `authenticated` nao tem UPDATE em
-- `ocorrencias`, e assim a tela nao consegue gravar um status por conta
-- propria, so por andamento.
--
-- ANEXOS: bucket privado `ocorrencias`, caminho `{ocorrencia_id}/{arquivo}`; a
-- primeira pasta amarra o arquivo a ocorrencia, no mesmo molde do bucket de
-- checklists (0042). O tipo e o tamanho sao limitados no bucket, mas o
-- `contentType` viaja como argumento do cliente (ver a 0046): quem LE
-- (`/anexos/[id]` no painel) devolve o tipo da lista, nunca o do objeto.
--
-- AVISO POR E-MAIL ("Avisar sobre a Finalizacao" e e-mails externos): os
-- campos ficam gravados, o envio e o item 4 do plano -- depende do dominio
-- proprio (#158). SMS fica fora, por decisao do dono.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Tipos de analise e de classificacao ---------------------------------------
-- No sistema de referencia, a conta do dono so tem "Em Analise" nos dois
-- cadastros (o cadastro dos tipos nao aparece no menu dela). Mesma semente.

create table if not exists public.tipos_de_analise (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tipos_de_analise_nome_nao_vazio check (length(btrim(nome)) > 0)
);
create unique index if not exists tipos_de_analise_nome_unico on public.tipos_de_analise (lower(btrim(nome)));

create table if not exists public.tipos_de_classificacao (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint tipos_de_classificacao_nome_nao_vazio check (length(btrim(nome)) > 0)
);
create unique index if not exists tipos_de_classificacao_nome_unico on public.tipos_de_classificacao (lower(btrim(nome)));

insert into public.tipos_de_analise (nome) values ('Em Análise') on conflict do nothing;
insert into public.tipos_de_classificacao (nome) values ('Em Análise') on conflict do nothing;

alter table public.tipos_de_analise enable row level security;
alter table public.tipos_de_classificacao enable row level security;

revoke all on public.tipos_de_analise, public.tipos_de_classificacao from anon, authenticated;
grant select on public.tipos_de_analise, public.tipos_de_classificacao to authenticated;
grant all on public.tipos_de_analise, public.tipos_de_classificacao to service_role;

drop policy if exists "Gestao le os tipos de analise" on public.tipos_de_analise;
create policy "Gestao le os tipos de analise" on public.tipos_de_analise
  for select to authenticated using ((select autorizacao.pode_ver_toda_operacao()));

drop policy if exists "Gestao le os tipos de classificacao" on public.tipos_de_classificacao;
create policy "Gestao le os tipos de classificacao" on public.tipos_de_classificacao
  for select to authenticated using ((select autorizacao.pode_ver_toda_operacao()));

-- 2) Andamentos ------------------------------------------------------------------

alter table public.ocorrencias add column if not exists finalizada_em timestamptz;

comment on column public.ocorrencias.finalizada_em is
  'Quando a ocorrencia foi finalizada (0064). Base do Tempo Medio de Resolucao.';

create table if not exists public.ocorrencia_andamentos (
  id bigint generated always as identity primary key,
  ocorrencia_id bigint not null references public.ocorrencias (id) on delete cascade,
  tipo text not null,
  tipo_analise_id bigint not null references public.tipos_de_analise (id),
  classificacao_id bigint references public.tipos_de_classificacao (id),
  -- "Analise do Evento" ou "Acoes Realizadas", conforme o tipo.
  texto text not null,
  responsavel_id uuid references public.profiles (id) on delete set null,
  grupo_usuario_id bigint references public.grupos_usuarios (id) on delete set null,
  apoio uuid[] not null default '{}',
  -- "Avisar sobre a Finalizacao" -- o envio e o item 4 do plano.
  avisar uuid[] not null default '{}',
  emails_externos text[] not null default '{}',
  autor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint ocorrencia_andamentos_tipo_check check (tipo in ('ANALISE', 'FINALIZACAO')),
  constraint ocorrencia_andamentos_texto_check check (length(btrim(texto)) > 0 and length(texto) <= 4000),
  constraint ocorrencia_andamentos_listas_check
    check (cardinality(apoio) <= 50 and cardinality(avisar) <= 50 and cardinality(emails_externos) <= 10),
  -- Classificacao e coisa da analise; a finalizacao nao a tem.
  constraint ocorrencia_andamentos_classificacao_check check (tipo = 'ANALISE' or classificacao_id is null)
);

comment on table public.ocorrencia_andamentos is
  'Historico de uma ocorrencia: as analises e a finalizacao. So o RPC
   `registrar_andamento_da_ocorrencia` grava; ninguem altera nem apaga.
   Migration 0064.';

create index if not exists ocorrencia_andamentos_ocorrencia_idx
  on public.ocorrencia_andamentos (ocorrencia_id, criado_em);

-- Uma finalizacao por ocorrencia, garantida no banco e nao so na tela.
create unique index if not exists ocorrencia_andamentos_uma_finalizacao
  on public.ocorrencia_andamentos (ocorrencia_id) where tipo = 'FINALIZACAO';

alter table public.ocorrencia_andamentos enable row level security;

revoke all on public.ocorrencia_andamentos from anon, authenticated;
grant select on public.ocorrencia_andamentos to authenticated;
-- `autor_id` e `criado_em` fora do grant: vem do default.
grant insert (ocorrencia_id, tipo, tipo_analise_id, classificacao_id, texto, responsavel_id,
              grupo_usuario_id, apoio, avisar, emails_externos)
  on public.ocorrencia_andamentos to authenticated;
grant all on public.ocorrencia_andamentos to service_role;

-- Le quem le a ocorrencia (o `exists` passa pelo RLS dela, da 0063).
drop policy if exists "Leitura do andamento no escopo da ocorrencia" on public.ocorrencia_andamentos;
create policy "Leitura do andamento no escopo da ocorrencia" on public.ocorrencia_andamentos
  for select to authenticated
  using (exists (select 1 from public.ocorrencias o where o.id = ocorrencia_andamentos.ocorrencia_id));

drop policy if exists "Gestao registra andamento da ocorrencia" on public.ocorrencia_andamentos;
create policy "Gestao registra andamento da ocorrencia" on public.ocorrencia_andamentos
  for insert to authenticated
  with check (
    (select autorizacao.pode_ver_toda_operacao())
    and exists (select 1 from public.ocorrencias o where o.id = ocorrencia_andamentos.ocorrencia_id)
  );

-- 3) Anexos ----------------------------------------------------------------------

create table if not exists public.ocorrencia_arquivos (
  id bigint generated always as identity primary key,
  andamento_id bigint not null references public.ocorrencia_andamentos (id) on delete cascade,
  ocorrencia_id bigint not null references public.ocorrencias (id) on delete cascade,
  storage_path text not null,
  nome_original text not null,
  criado_em timestamptz not null default now(),
  constraint ocorrencia_arquivos_path_unico unique (storage_path),
  constraint ocorrencia_arquivos_nome_check check (length(btrim(nome_original)) > 0 and length(nome_original) <= 200),
  -- O caminho comeca pela pasta da ocorrencia: e o que amarra o objeto a ela.
  constraint ocorrencia_arquivos_pasta_check check (storage_path like ocorrencia_id::text || '/%')
);

create index if not exists ocorrencia_arquivos_andamento_idx on public.ocorrencia_arquivos (andamento_id);
create index if not exists ocorrencia_arquivos_ocorrencia_idx on public.ocorrencia_arquivos (ocorrencia_id);

alter table public.ocorrencia_arquivos enable row level security;

revoke all on public.ocorrencia_arquivos from anon, authenticated;
grant select on public.ocorrencia_arquivos to authenticated;
grant insert (andamento_id, ocorrencia_id, storage_path, nome_original) on public.ocorrencia_arquivos to authenticated;
grant all on public.ocorrencia_arquivos to service_role;

drop policy if exists "Leitura do anexo no escopo da ocorrencia" on public.ocorrencia_arquivos;
create policy "Leitura do anexo no escopo da ocorrencia" on public.ocorrencia_arquivos
  for select to authenticated
  using (exists (select 1 from public.ocorrencias o where o.id = ocorrencia_arquivos.ocorrencia_id));

drop policy if exists "Gestao anexa arquivo ao andamento" on public.ocorrencia_arquivos;
create policy "Gestao anexa arquivo ao andamento" on public.ocorrencia_arquivos
  for insert to authenticated
  with check (
    (select autorizacao.pode_ver_toda_operacao())
    -- O andamento tem que ser DESTA ocorrencia: sem isto, um anexo apontaria
    -- para o andamento de outra e apareceria no historico errado.
    and exists (
      select 1 from public.ocorrencia_andamentos a
       where a.id = ocorrencia_arquivos.andamento_id
         and a.ocorrencia_id = ocorrencia_arquivos.ocorrencia_id
    )
  );

-- Bucket privado, pelo mesmo motivo do de checklists: anexo de ocorrencia pode
-- ter foto de funcionario e de instalacao de cliente (docs/lgpd-privacidade.md).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocorrencias', 'ocorrencias', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'application/pdf', 'application/zip', 'application/x-zip-compressed',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O regex vem antes do cast, de proposito (ver a 0042): `'abc'::bigint`
-- levanta excecao, e policy que levanta vira erro 500 para quem so mandou um
-- caminho torto.
drop policy if exists "Gestao envia anexo da ocorrencia" on storage.objects;
create policy "Gestao envia anexo da ocorrencia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocorrencias'
    and (select autorizacao.pode_ver_toda_operacao())
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and exists (
      select 1 from public.ocorrencias o
       where o.id = ((storage.foldername(name))[1])::bigint
    )
  );

drop policy if exists "Leitura do anexo da ocorrencia no escopo" on storage.objects;
create policy "Leitura do anexo da ocorrencia no escopo" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ocorrencias'
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and exists (
      select 1 from public.ocorrencias o
       where o.id = ((storage.foldername(name))[1])::bigint
    )
  );

-- Sem policy de UPDATE/DELETE no bucket: anexo enviado nao e reescrito pela
-- sessao. Remocao por retencao de LGPD roda com `service_role`.

-- 4) O trigger que muda o status ----------------------------------------------------

create schema if not exists manutencao;

create or replace function manutencao.andamento_da_ocorrencia_muda_o_status()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_status text;
begin
  -- A permissao vem PRIMEIRO: o trigger BEFORE roda antes da policy de INSERT, e
  -- sem isto quem nao pode receberia "ja encerrada" (23514) em vez de "sem
  -- permissao" (42501) -- um jeito de sondar, por tentativa, quais ocorrencias
  -- ja foram encerradas. `auth.uid()` nulo e service_role (rotinas de dados),
  -- que nao passa por sessao.
  if auth.uid() is not null and not autorizacao.pode_ver_toda_operacao() then
    raise exception 'Sem permissão para registrar andamento.' using errcode = '42501';
  end if;

  -- `for update`: duas finalizacoes no mesmo instante esperam uma pela outra, e
  -- a segunda ja encontra a ocorrencia ATENDIDA.
  select status into v_status from public.ocorrencias where id = new.ocorrencia_id for update;

  if v_status in ('ATENDIDO', 'CANCELADO') then
    raise exception 'Ocorrência já encerrada (%).', v_status using errcode = '23514';
  end if;

  if new.tipo = 'ANALISE' then
    if v_status = 'AGUARDANDO' then
      update public.ocorrencias set status = 'EM_ANALISE' where id = new.ocorrencia_id;
    end if;
  else
    update public.ocorrencias
       set status = 'ATENDIDO', finalizada_em = new.criado_em
     where id = new.ocorrencia_id;
  end if;

  return new;
end;
$$;

revoke all on function manutencao.andamento_da_ocorrencia_muda_o_status() from public, anon, authenticated;

drop trigger if exists andamento_da_ocorrencia_muda_o_status on public.ocorrencia_andamentos;
create trigger andamento_da_ocorrencia_muda_o_status
  before insert on public.ocorrencia_andamentos
  for each row execute function manutencao.andamento_da_ocorrencia_muda_o_status();

-- 5) Envio atomico ---------------------------------------------------------------------
-- O andamento e os anexos sao dois inserts; feitos pela API, uma falha no meio
-- deixaria o andamento sem os arquivos. `security invoker`: atomicidade, nao
-- privilegio -- as policies e o trigger acima continuam sendo o portao.
-- `p_arquivos`: [{"storage_path": "12/abc-foto.jpg", "nome": "foto.jpg"}].

create or replace function public.registrar_andamento_da_ocorrencia(
  p_ocorrencia_id bigint,
  p_tipo text,
  p_tipo_analise_id bigint,
  p_texto text,
  p_classificacao_id bigint default null,
  p_responsavel_id uuid default null,
  p_grupo_usuario_id bigint default null,
  p_apoio uuid[] default '{}',
  p_avisar uuid[] default '{}',
  p_emails_externos text[] default '{}',
  p_arquivos jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.ocorrencia_andamentos (
    ocorrencia_id, tipo, tipo_analise_id, classificacao_id, texto, responsavel_id,
    grupo_usuario_id, apoio, avisar, emails_externos
  ) values (
    p_ocorrencia_id, p_tipo, p_tipo_analise_id, p_classificacao_id, p_texto, p_responsavel_id,
    p_grupo_usuario_id, coalesce(p_apoio, '{}'), coalesce(p_avisar, '{}'), coalesce(p_emails_externos, '{}')
  )
  returning id into v_id;

  insert into public.ocorrencia_arquivos (andamento_id, ocorrencia_id, storage_path, nome_original)
  select v_id, p_ocorrencia_id, a ->> 'storage_path', a ->> 'nome'
    from jsonb_array_elements(coalesce(p_arquivos, '[]'::jsonb)) as a;

  return v_id;
end;
$$;

comment on function public.registrar_andamento_da_ocorrencia(bigint, text, bigint, text, bigint, uuid, bigint, uuid[], uuid[], text[], jsonb) is
  'Grava uma analise ou a finalizacao de uma ocorrencia, com os anexos, numa
   transacao. security INVOKER de proposito: as policies e o trigger da 0064
   sao o portao.';

revoke all on function public.registrar_andamento_da_ocorrencia(bigint, text, bigint, text, bigint, uuid, bigint, uuid[], uuid[], text[], jsonb) from public, anon;
grant execute on function public.registrar_andamento_da_ocorrencia(bigint, text, bigint, text, bigint, uuid, bigint, uuid[], uuid[], text[], jsonb) to authenticated;
