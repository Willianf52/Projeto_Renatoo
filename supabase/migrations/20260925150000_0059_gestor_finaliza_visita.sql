-- ============================================================================
-- 0059 -- GESTOR tambem finaliza visita, e o checklist guarda quem enviou
--
-- DECISAO DO DONO (25/09/2026): "essa funcao e para funcionar tanto para
-- inspetor tanto para gestor". Ate aqui as quatro policies de escrita do
-- checklist (0042, com a amarra de caminho da 0045) exigiam
-- `e_inspetor() and visita.funcionario_id = auth.uid()`: o gestor abria o app,
-- via a lista de visitas e nao tinha como fechar nenhuma.
--
-- Escolhas, confirmadas uma a uma com o dono:
--   - so GESTOR entra (SUPERVISOR, OPERACIONAL, OPERADOR e CLIENTE continuam
--     so lendo);
--   - o gestor fecha QUALQUER visita que enxerga (`pode_ver_visita`). "So as
--     dele" seria lista vazia: INSERT em `visitas` segue exclusivo do
--     inspetor (0036);
--   - o checklist passa a guardar QUEM enviou (`enviado_por`). Sem isso, um
--     checklist fechado pelo gestor na visita de um inspetor sairia no
--     relatorio como se o inspetor o tivesse fechado.
--
-- O QUE NAO MUDA: o inspetor continua fechando so a propria visita, e continua
-- sem UPDATE/DELETE em nada disso. O gestor tambem nao ganha UPDATE/DELETE --
-- checklist enviado segue imutavel pelo app. A leitura (policies de SELECT)
-- fica como estava.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) A regra num lugar so ------------------------------------------------------
-- As quatro policies abaixo faziam o mesmo `exists` sobre `visitas`, repetido.
-- Com dois caminhos (inspetor dono OU gestor), repetir a disjuncao quatro vezes
-- seria o convite para uma delas divergir. A funcao mora em `autorizacao`, fora
-- da API, como as outras auxiliares de RLS desde a 0050 -- e e chamada
-- qualificada, pelo mesmo motivo registrado la.
--
-- `security definer`: le `visitas` e `profiles` sem passar pelo RLS de quem
-- chama, que e o que evita recursao e o que as demais auxiliares ja fazem.

create or replace function autorizacao.pode_finalizar_visita(id_da_visita bigint)
returns boolean
language sql
security definer
stable
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.usuario_ativo() and (
    (
      autorizacao.e_inspetor()
      and exists (
        select 1 from public.visitas v
        where v.id = id_da_visita
          and v.funcionario_id = auth.uid()
      )
    )
    or (
      autorizacao.nivel_acesso_atual() = 'GESTOR'
      and autorizacao.pode_ver_visita(id_da_visita)
    )
  );
$$;

comment on function autorizacao.pode_finalizar_visita(bigint) is
  'Quem pode gravar o checklist de uma visita (checklist, respostas, fotos e a
   midia no bucket): o INSPETOR ativo dono da visita, ou um GESTOR ativo que a
   enxerga. Migration 0059.';

revoke all on function autorizacao.pode_finalizar_visita(bigint) from public;
grant execute on function autorizacao.pode_finalizar_visita(bigint) to authenticated, service_role;

-- 2) Quem enviou ----------------------------------------------------------------
-- Nulavel so por causa das linhas antigas no momento do `add column`; o
-- backfill logo abaixo as preenche, e daqui para a frente o trigger preenche
-- toda linha nova.

alter table public.checklists_visita
  add column if not exists enviado_por uuid references public.profiles (id) on delete set null;

comment on column public.checklists_visita.enviado_por is
  'Quem enviou o checklist -- sempre o usuario da sessao, gravado pelo trigger
   `definir_enviado_por`, nunca pelo cliente. Pode diferir de
   `visitas.funcionario_id` quando um GESTOR fecha a visita de um inspetor (0059).';

-- Ate a 0059 so o inspetor dono da visita conseguia gravar checklist, entao
-- para as linhas antigas "quem enviou" e exatamente o dono da visita.
update public.checklists_visita c
   set enviado_por = v.funcionario_id
  from public.visitas v
 where v.id = c.visita_id
   and c.enviado_por is null;

-- FK sem indice e o que o advisor 0001 acusa (ver 0030); e e por esta coluna
-- que o painel vai juntar o nome de quem enviou.
create index if not exists checklists_visita_enviado_por_idx
  on public.checklists_visita (enviado_por);

-- O cliente NAO escolhe o autor. `authenticated` tem INSERT na tabela inteira
-- (0042), entao sem o trigger um insert direto pelo PostgREST poderia gravar
-- `enviado_por` de outra pessoa. O trigger sobrescreve com `auth.uid()` sempre,
-- tambem quando a coluna vem preenchida.

create or replace function public.definir_enviado_por()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.enviado_por := auth.uid();
  return new;
end;
$$;

revoke all on function public.definir_enviado_por() from public;

drop trigger if exists definir_enviado_por on public.checklists_visita;
create trigger definir_enviado_por
  before insert on public.checklists_visita
  for each row execute function public.definir_enviado_por();

-- 3) As quatro policies de escrita ---------------------------------------------
-- Mesmos nomes de antes, para quem ler o historico de `pg_policies` achar a
-- mesma regra no mesmo lugar -- so o predicado muda. A amarra de caminho da
-- 0045 (foto dentro da pasta da propria visita) continua, identica.

drop policy if exists "Inspetor grava checklist da propria visita" on public.checklists_visita;
create policy "Inspetor grava checklist da propria visita" on public.checklists_visita
  for insert to authenticated
  with check (autorizacao.pode_finalizar_visita(visita_id));

drop policy if exists "Inspetor grava resposta do proprio checklist" on public.checklist_respostas;
create policy "Inspetor grava resposta do proprio checklist" on public.checklist_respostas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklists_visita c
      where c.id = checklist_respostas.checklist_id
        and autorizacao.pode_finalizar_visita(c.visita_id)
    )
  );

drop policy if exists "Inspetor grava foto do proprio checklist" on public.checklist_fotos;
create policy "Inspetor grava foto do proprio checklist" on public.checklist_fotos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklists_visita c
      where c.id = checklist_fotos.checklist_id
        and autorizacao.pode_finalizar_visita(c.visita_id)
        and checklist_fotos.storage_path like (c.visita_id::text || '/%')
    )
  );

-- O regex antes do cast continua pelo motivo da 0042: `'abc'::bigint` levanta
-- excecao, e policy que levanta excecao vira erro 500 em vez de recusa.
drop policy if exists "Inspetor envia midia da propria visita" on storage.objects;
create policy "Inspetor envia midia da propria visita" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'checklists'
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and autorizacao.pode_finalizar_visita(((storage.foldername(name))[1])::bigint)
  );
