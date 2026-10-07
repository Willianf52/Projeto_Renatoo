-- ============================================================================
-- 0066 -- Excluir checklist (Historico de Checklist)
--
-- ISSUE #177, PRIMEIRO ITEM. No sistema de referencia o Historico de Checklist
-- tem "Excluir", com o modal "Exclusao Fisica": o checklist sai do banco e
-- nao ha como recupera-lo. Ate aqui `checklists_visita` so aceitava INSERT
-- (0042) -- esta migration abre o DELETE, e so ele.
--
-- REGRAS DECIDIDAS COM O DONO (07/10/2026):
--
--   - so GESTOR exclui (`autorizacao.pode_administrar_usuarios`: GESTOR
--     ativo), e so checklist que ele ve;
--   - as ocorrencias que o checklist abriu (0063) saem junto, pela cascata
--     que ja existe -- mas se alguma ja tiver analise ou finalizacao (0064),
--     ou status fora de AGUARDANDO/CRITICO, a exclusao e recusada (23514): o
--     trabalho de quem tratou a ocorrencia nao some por causa do checklist.
--
-- O QUE SAI JUNTO, PELAS CASCATAS JA EXISTENTES: respostas e fotos (0042),
-- ocorrencias (0063) e o registro dos e-mails delas (0065). A visita fica: ela
-- e da coleta, nao do checklist. Os ARQUIVOS no Storage (assinatura e fotos)
-- nao saem por cascata -- quem apaga e a Server Action do painel, depois de o
-- DELETE dar certo, com os caminhos da propria linha excluida.
--
-- RASTRO: cada exclusao vai para `auditoria` (0034) com a linha inteira do
-- checklist e quem excluiu.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Quem exclui ------------------------------------------------------------------

create or replace function autorizacao.pode_excluir_checklist(id_da_visita bigint)
returns boolean
language sql
security definer
stable
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.pode_administrar_usuarios()
    and autorizacao.pode_ver_visita(id_da_visita);
$$;

comment on function autorizacao.pode_excluir_checklist(bigint) is
  'Quem exclui checklist: GESTOR ativo, em visita que ve. Migration 0066.';

revoke all on function autorizacao.pode_excluir_checklist(bigint) from public;
grant execute on function autorizacao.pode_excluir_checklist(bigint) to authenticated, service_role;

grant delete on public.checklists_visita to authenticated;

drop policy if exists "Gestor exclui checklist" on public.checklists_visita;
create policy "Gestor exclui checklist" on public.checklists_visita
  for delete to authenticated
  using (autorizacao.pode_excluir_checklist(visita_id));

-- 2) Ocorrencia ja tratada segura o checklist ---------------------------------------
-- BEFORE DELETE so dispara para a linha que passou pelo USING da policy acima:
-- quem nao pode excluir nao chega aqui, e o erro nao revela o status de
-- ocorrencia nenhuma (diferente do INSERT da 0064, em que o trigger roda antes
-- do WITH CHECK).
--
-- `for update` nas ocorrencias: o trigger da 0064 tranca a mesma linha ao
-- registrar um andamento, entao exclusao e analise simultaneas se enfileiram
-- em vez de a analise ser apagada no meio do caminho.
--
-- So vale para sessao de pessoa (`auth.uid()`): a remocao por retencao de LGPD
-- roda com `service_role` (ver a 0042) e nao e barrada por esta regra de tela.

create or replace function manutencao.checklist_com_ocorrencia_tratada_fica()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  perform 1 from public.ocorrencias o where o.checklist_id = old.id for update;

  if exists (
    select 1 from public.ocorrencias o
     where o.checklist_id = old.id
       and (
         o.status not in ('AGUARDANDO', 'CRITICO')
         or exists (select 1 from public.ocorrencia_andamentos a where a.ocorrencia_id = o.id)
       )
  ) then
    raise exception 'Este checklist tem ocorrência já analisada ou finalizada e não pode ser excluído.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function manutencao.checklist_com_ocorrencia_tratada_fica() from public, anon, authenticated;

drop trigger if exists checklist_com_ocorrencia_tratada_fica on public.checklists_visita;
create trigger checklist_com_ocorrencia_tratada_fica
  before delete on public.checklists_visita
  for each row execute function manutencao.checklist_com_ocorrencia_tratada_fica();

-- 3) Rastro na auditoria ----------------------------------------------------------
-- So DELETE: o envio do checklist ja tem autor e data na propria linha
-- (`enviado_por`, `criado_em`), e auditar cada INSERT duplicaria a tabela.

drop trigger if exists auditoria_trigger on public.checklists_visita;
create trigger auditoria_trigger
  after delete on public.checklists_visita
  for each row execute function public.registrar_auditoria();
