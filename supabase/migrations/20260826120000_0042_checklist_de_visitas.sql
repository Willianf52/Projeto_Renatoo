-- ============================================================================
-- VeloxLab — Checklist de visitas (app de campo)
--
-- Até aqui o inspetor só gravava `visitas` + `leituras` (0036): o QR lido, a
-- hora e o evento. O que ele *viu* no local não tinha onde entrar. O produto
-- pediu duas formas de fechar uma visita no celular:
--
--   CORRETIVA   -- o inspetor descreve o motivo da visita, tira foto e colhe
--                  a assinatura do responsável no local.
--   CONSULTORIA -- responde as perguntas do checklist vigente, tira foto e
--                  colhe a assinatura.
--
-- TABELA NOVA, NÃO COLUNA EM `visitas` -- `visitas` é alimentada por dois
-- caminhos: a rota de importação em lote (0003/0004), que recebe dado de
-- sistema de terceiro, e o app (0036). Sete relatórios do painel leem dela.
-- Pendurar motivo/assinatura ali misturaria dado integrado com dado de campo
-- na mesma linha, e faria toda consulta de relatório carregar coluna que ela
-- não usa. A visita continua sendo "o que foi coletado"; o checklist é "o que
-- o inspetor registrou sobre a visita", e são dois assuntos.
--
-- PERGUNTAS EM TABELA, NÃO CONSTANTE NO APP -- decisão de produto
-- (2026-08-26): trocar o texto de uma pergunta não pode exigir publicar
-- versão nova na loja e esperar o inspetor atualizar. O cadastro alimenta o
-- item `ChecklistLab` do menu do painel, hoje desabilitado.
--
-- A TABELA NASCE VAZIA, DE PROPÓSITO -- o texto das 10 perguntas entra depois,
-- pelo cadastro. Sem seed aqui: um seed viraria a "versão de verdade" das
-- perguntas e brigaria com o que for cadastrado.
--
-- SÓ INSERT, como na 0036 -- corrigir checklist enviado continua sendo tarefa
-- de quem administra, pelo portal. Sem policy de UPDATE/DELETE aqui.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Cadastro das perguntas ---------------------------------------------------
-- Sem RLS de escrita: como `cargo`/`ativo` (0013) e o vínculo de cliente
-- (0014), cadastrar pergunta é ato de gestão e vai por `service_role` pela
-- tela do painel. Aqui só a leitura, que todo usuário ativo precisa ter --
-- o app baixa a lista antes de ir a campo.

create table if not exists public.perguntas_checklist (
  id bigint generated always as identity primary key,
  ordem smallint not null,
  texto text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint perguntas_checklist_ordem_unica unique (ordem),
  constraint perguntas_checklist_texto_nao_vazio check (length(btrim(texto)) > 0)
);

comment on table public.perguntas_checklist is
  'Perguntas do checklist de CONSULTORIA. `ordem` e nao o id define a sequencia
   na tela -- inserir pergunta no meio da lista nao deve depender de reescrever
   ids ja referenciados por respostas antigas.';

alter table public.perguntas_checklist enable row level security;

drop policy if exists "Leitura das perguntas para usuarios ativos" on public.perguntas_checklist;
create policy "Leitura das perguntas para usuarios ativos" on public.perguntas_checklist
  for select to authenticated
  using (public.usuario_ativo());

-- 2) Quem pode ver uma visita -------------------------------------------------
-- As três tabelas abaixo recortam pela visita a que pertencem, e o recorte é
-- exatamente o da policy de SELECT de `visitas` (0014). Escrito como função em
-- vez de repetido quatro vezes: quatro cópias do mesmo predicado são quatro
-- lugares para desencontrar quando a regra mudar -- que é o mesmo motivo de
-- `pode_ver_grupo_site` existir.
--
-- `security definer` + `stable` + `pg_temp` no fim do search_path: as três
-- convenções da 0027/0041.

create or replace function public.pode_ver_visita(id_da_visita bigint)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.visitas v
    where v.id = id_da_visita
      and (
        public.pode_ver_toda_operacao()
        or (public.usuario_ativo() and v.funcionario_id = auth.uid())
        or (public.e_cliente() and exists (
          select 1 from public.sites s
          where s.id = v.site_id and public.pode_ver_grupo_site(s.grupo_site_id)
        ))
      )
  );
$$;

comment on function public.pode_ver_visita(bigint) is
  'Espelha a policy "Leitura da operacao no escopo" de `visitas` (0014) para as
   tabelas que penduram nela. Alterou o recorte da visita? Altere aqui junto --
   sao a mesma regra.';

revoke all on function public.pode_ver_visita(bigint) from public;
grant execute on function public.pode_ver_visita(bigint) to authenticated;

-- 3) O checklist --------------------------------------------------------------
-- `tipo` como check de texto e não enum, seguindo `profiles_cargo_check`
-- (0003/0036): acrescentar um valor a um enum do Postgres não roda dentro de
-- transação em toda versão, e o check recriado é o padrão que este banco já usa.
--
-- O check de `motivo` é a regra da tela escrita no banco: na CORRETIVA o motivo
-- é obrigatório, na CONSULTORIA ele não existe. Sem isto a regra moraria só no
-- app -- e um app de campo é justamente o cliente que pode estar desatualizado.

create table if not exists public.checklists_visita (
  id bigint generated always as identity primary key,
  visita_id bigint not null references public.visitas (id) on delete cascade,
  tipo text not null,
  motivo text,
  assinatura_path text not null,
  criado_em timestamptz not null default now(),
  -- Uma visita fecha com um checklist. Reenviar não duplica: o segundo insert
  -- falha, e o app trata como "já enviado" em vez de gerar duas versões da
  -- mesma inspeção -- o caso do inspetor que perde sinal e toca em Enviar de novo.
  constraint checklists_visita_visita_unica unique (visita_id),
  constraint checklists_visita_assinatura_nao_vazia check (length(btrim(assinatura_path)) > 0)
);

alter table public.checklists_visita drop constraint if exists checklists_visita_tipo_check;
alter table public.checklists_visita
  add constraint checklists_visita_tipo_check
  check (tipo in ('CORRETIVA', 'CONSULTORIA'));

alter table public.checklists_visita drop constraint if exists checklists_visita_motivo_por_tipo;
alter table public.checklists_visita
  add constraint checklists_visita_motivo_por_tipo
  check (
    (tipo = 'CORRETIVA' and motivo is not null and length(btrim(motivo)) > 0)
    or (tipo = 'CONSULTORIA' and motivo is null)
  );

comment on table public.checklists_visita is
  'Fechamento de uma visita pelo app de campo. `assinatura_path` aponta para o
   bucket privado `checklists` -- o traco e guardado como PNG no Storage, nao
   como base64 em coluna: a linha e lida por relatorio, a imagem nao.';

alter table public.checklists_visita enable row level security;

create index if not exists checklists_visita_visita_idx
  on public.checklists_visita (visita_id);

-- 4) Respostas ----------------------------------------------------------------
-- PK composta (checklist, pergunta): a mesma pergunta não é respondida duas
-- vezes no mesmo checklist, e isso é estrutura, não validação de app.
--
-- `resposta` tem 'NA' além de SIM/NÃO porque um checklist de campo sempre tem
-- item que não se aplica ao site visitado, e forçar SIM/NÃO ali faz o inspetor
-- mentir para conseguir enviar.
--
-- `on delete restrict` na pergunta, de propósito: apagar pergunta que já foi
-- respondida apagaria histórico de inspeção. Despublique com `ativo = false`.

create table if not exists public.checklist_respostas (
  checklist_id bigint not null references public.checklists_visita (id) on delete cascade,
  pergunta_id bigint not null references public.perguntas_checklist (id) on delete restrict,
  resposta text not null,
  observacao text,
  primary key (checklist_id, pergunta_id)
);

alter table public.checklist_respostas drop constraint if exists checklist_respostas_resposta_check;
alter table public.checklist_respostas
  add constraint checklist_respostas_resposta_check
  check (resposta in ('SIM', 'NAO', 'NA'));

alter table public.checklist_respostas enable row level security;

create index if not exists checklist_respostas_pergunta_idx
  on public.checklist_respostas (pergunta_id);

-- 5) Fotos --------------------------------------------------------------------
-- Tabela e não coluna array: a foto ganha data própria e, quando a auditoria
-- (0034) for estendida ao campo, uma linha por foto é o que dá para referenciar.

create table if not exists public.checklist_fotos (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references public.checklists_visita (id) on delete cascade,
  storage_path text not null,
  criado_em timestamptz not null default now(),
  constraint checklist_fotos_path_unico unique (storage_path)
);

alter table public.checklist_fotos enable row level security;

create index if not exists checklist_fotos_checklist_idx
  on public.checklist_fotos (checklist_id);

-- 6) Grants -------------------------------------------------------------------
-- A 0031/0038 fecharam a escrita por papel; devolvem-se aqui só SELECT e
-- INSERT, e nas tabelas do checklist apenas. Grant é pré-requisito -- a policy
-- do passo 7 é o portão de verdade (doutrina da 0009, repetida na 0036).
--
-- Sem UPDATE/DELETE para `authenticated` em nenhuma das quatro: mesmo que uma
-- policy futura afrouxe, o grant continua sendo o segundo portão.

grant select on public.perguntas_checklist to authenticated;
grant select, insert on public.checklists_visita to authenticated;
grant select, insert on public.checklist_respostas to authenticated;
grant select, insert on public.checklist_fotos to authenticated;

revoke update, delete, truncate on public.perguntas_checklist from authenticated;
revoke update, delete, truncate on public.checklists_visita from authenticated;
revoke update, delete, truncate on public.checklist_respostas from authenticated;
revoke update, delete, truncate on public.checklist_fotos from authenticated;

-- `id` é `generated always as identity`: o cliente não escolhe id nem por
-- engano. Não há grant de coluna a restringir além disso -- nenhuma coluna
-- destas tabelas concede poder, ao contrário de `profiles.cargo`.

-- 7) Policies -----------------------------------------------------------------
-- `(select auth.uid())` e não `auth.uid()` direto: a 0029/0037 converteram
-- todas as policies para a forma de InitPlan, que o planner avalia uma vez por
-- consulta em vez de uma vez por linha.

drop policy if exists "Leitura do checklist no escopo" on public.checklists_visita;
create policy "Leitura do checklist no escopo" on public.checklists_visita
  for select to authenticated
  using (public.pode_ver_visita(visita_id));

drop policy if exists "Inspetor grava checklist da propria visita" on public.checklists_visita;
create policy "Inspetor grava checklist da propria visita" on public.checklists_visita
  for insert to authenticated
  with check (
    public.e_inspetor()
    and exists (
      select 1 from public.visitas v
      where v.id = checklists_visita.visita_id
        and v.funcionario_id = (select auth.uid())
    )
  );

drop policy if exists "Leitura das respostas no escopo" on public.checklist_respostas;
create policy "Leitura das respostas no escopo" on public.checklist_respostas
  for select to authenticated
  using (exists (
    select 1 from public.checklists_visita c
    where c.id = checklist_respostas.checklist_id and public.pode_ver_visita(c.visita_id)
  ));

drop policy if exists "Inspetor grava resposta do proprio checklist" on public.checklist_respostas;
create policy "Inspetor grava resposta do proprio checklist" on public.checklist_respostas
  for insert to authenticated
  with check (
    public.e_inspetor()
    and exists (
      select 1
      from public.checklists_visita c
      join public.visitas v on v.id = c.visita_id
      where c.id = checklist_respostas.checklist_id
        and v.funcionario_id = (select auth.uid())
    )
  );

drop policy if exists "Leitura das fotos no escopo" on public.checklist_fotos;
create policy "Leitura das fotos no escopo" on public.checklist_fotos
  for select to authenticated
  using (exists (
    select 1 from public.checklists_visita c
    where c.id = checklist_fotos.checklist_id and public.pode_ver_visita(c.visita_id)
  ));

drop policy if exists "Inspetor grava foto do proprio checklist" on public.checklist_fotos;
create policy "Inspetor grava foto do proprio checklist" on public.checklist_fotos
  for insert to authenticated
  with check (
    public.e_inspetor()
    and exists (
      select 1
      from public.checklists_visita c
      join public.visitas v on v.id = c.visita_id
      where c.id = checklist_fotos.checklist_id
        and v.funcionario_id = (select auth.uid())
    )
  );

-- 8) Bucket privado -----------------------------------------------------------
-- `public = false`: a URL do objeto não abre sem token. Foto de instalação de
-- cliente e assinatura de pessoa física são dado pessoal (ver
-- `docs/lgpd-privacidade.md`) -- bucket público aqui seria vazamento por
-- configuração, do mesmo tipo que a 0008 fechou.

insert into storage.buckets (id, name, public)
values ('checklists', 'checklists', false)
on conflict (id) do update set public = false;

-- O caminho é `{visita_id}/{arquivo}`. A primeira pasta é a chave de
-- autorização: é o que amarra o objeto à visita sem precisar do id do
-- checklist, que ainda não existe no momento do upload (a assinatura sobe
-- antes da linha que a referencia).
--
-- O regex vem antes do cast, de propósito: `'abc'::bigint` levanta exceção, e
-- uma policy que levanta exceção em vez de devolver falso vira erro 500 para
-- quem só mandou um caminho torto.

drop policy if exists "Inspetor envia midia da propria visita" on storage.objects;
create policy "Inspetor envia midia da propria visita" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'checklists'
    and public.e_inspetor()
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and exists (
      select 1 from public.visitas v
      where v.id = ((storage.foldername(name))[1])::bigint
        and v.funcionario_id = (select auth.uid())
    )
  );

drop policy if exists "Leitura da midia de checklist no escopo" on storage.objects;
create policy "Leitura da midia de checklist no escopo" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'checklists'
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and public.pode_ver_visita(((storage.foldername(name))[1])::bigint)
  );

-- Sem policy de UPDATE/DELETE no bucket: pelo mesmo motivo das tabelas, foto e
-- assinatura enviadas não são reescritas pelo aparelho. Remoção por retenção
-- de LGPD roda com `service_role`, fora do alcance da sessão do inspetor.

-- 9) Envio atômico -------------------------------------------------------------
-- O envio são três inserts (checklist, fotos, respostas). Feitos como três
-- chamadas do PostgREST, cada uma é a sua própria transação: perder sinal entre
-- a primeira e a segunda deixa no banco um checklist sem resposta nenhuma --
-- indistinguível, para o painel, de uma inspeção em que o inspetor não
-- respondeu nada. Numa função, os três estão na mesma transação.
--
-- `security invoker`, e este é o ponto: a função NÃO contorna o RLS. Cada
-- insert lá dentro passa pelas policies do passo 7, com o `auth.uid()` de quem
-- chamou. É o oposto de `security definer` -- aqui não há privilégio a
-- emprestar, só atomicidade a garantir.
--
-- `set search_path = public, pg_temp` mesmo sendo invoker: a 0041 registra por
-- que a regra vale sem exceção ("uma invariante com exceção é uma invariante
-- que ninguém verifica").

create or replace function public.registrar_checklist(
  p_visita_id bigint,
  p_tipo text,
  p_motivo text,
  p_assinatura_path text,
  p_fotos text[],
  p_respostas jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.checklists_visita (visita_id, tipo, motivo, assinatura_path)
  values (p_visita_id, p_tipo, nullif(btrim(coalesce(p_motivo, '')), ''), p_assinatura_path)
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

  return v_id;
end;
$$;

comment on function public.registrar_checklist(bigint, text, text, text, text[], jsonb) is
  'Envio do checklist em uma transacao. security INVOKER de proposito: as
   policies da 0042 continuam sendo o portao -- a funcao existe por
   atomicidade, nao por privilegio.';

revoke all on function public.registrar_checklist(bigint, text, text, text, text[], jsonb) from public;
grant execute on function public.registrar_checklist(bigint, text, text, text, text[], jsonb) to authenticated;
