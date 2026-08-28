-- ============================================================================
-- VeloxLab — Amarra o caminho da midia do checklist a pasta da propria visita
--
-- Achado M-4 da auditoria AppSec de 2026-08-28.
--
-- O PROBLEMA: as policies de `storage.objects` (0042) derivam a autorizacao da
-- primeira pasta do caminho, e isso esta certo. Mas as COLUNAS que guardam
-- esses caminhos nao tinham amarra nenhuma: `assinatura_path` so exigia nao
-- ser vazio, `storage_path` so exigia ser unico.
--
-- Quem garantia que o caminho aponta para a pasta da propria visita era
-- `esquemaDeChecklistDeVisita` (packages/shared/src/campo/checklist.ts) --
-- e ele roda no aparelho. E o mesmo raciocinio que a 0042 ja escreveu para o
-- check de `motivo` por tipo: "um app de campo e justamente o cliente que pode
-- estar desatualizado". Vale para o motivo; vale igual para o caminho.
--
-- POR QUE A CORRECAO NAO MORA EM `registrar_checklist()`: seria o lugar obvio
-- -- e o unico ponto de entrada que a aplicacao usa, e ja tem `p_visita_id` na
-- mao. Mas nao e o unico caminho possivel: a 0042 concede
-- `grant select, insert on public.checklist_fotos to authenticated`, entao um
-- INSPETOR pode falar direto com `POST /rest/v1/checklist_fotos` e pular a
-- funcao inteira. Validacao dentro da funcao seria a mesma classe de erro que
-- o achado aponta -- portao no caminho educado, porta aberta ao lado. A regra
-- desce para onde toda escrita passa: policy e check constraint.
--
-- IMPACTO DO QUE SE FECHA: e integridade, nao confidencialidade -- vale ser
-- preciso. Como a policy de SELECT do Storage recalcula a autorizacao a partir
-- do proprio caminho, pendurar o caminho de outra visita nunca tornou aquela
-- midia legivel para quem nao podia ve-la. O que se conseguia era sujar o
-- checklist com referencia a midia alheia ou inexistente, e -- pela constraint
-- `checklist_fotos_path_unico` -- um oraculo fraco de existencia de caminho,
-- via violacao 23505. Amarrado o prefixo, a sondagem fica restrita as visitas
-- do proprio inspetor, o que a esvazia.
--
-- SOBRE DADO EXISTENTE: o unico escritor ate hoje e o app de campo, via
-- `caminhoDeMidiaDaVisita(visitaId, ...)`, que sempre produz
-- `{visita_id}/{nome}.{ext}`. Toda linha ja gravada satisfaz as duas regras --
-- se alguma nao satisfizer, esta migration falha alto, que e o comportamento
-- desejado: seria exatamente a linha forjada que o achado descreve.
-- ============================================================================

-- 1) Assinatura: check constraint direto ------------------------------------
-- `checklists_visita` tem `visita_id` na propria linha, entao a regra cabe num
-- check comum. `like` e o cast de bigint para text sao imutaveis, que e o que
-- o Postgres exige de uma expressao de constraint.

alter table public.checklists_visita
  drop constraint if exists checklists_visita_assinatura_na_pasta_da_visita;

alter table public.checklists_visita
  add constraint checklists_visita_assinatura_na_pasta_da_visita
  check (assinatura_path like (visita_id::text || '/%'));

comment on constraint checklists_visita_assinatura_na_pasta_da_visita
  on public.checklists_visita is
  'O caminho da assinatura mora na pasta da propria visita -- mesma chave de
   autorizacao que as policies de storage.objects usam (0042).';

-- 2) Fotos: a amarra entra na policy ----------------------------------------
-- `checklist_fotos` nao tem `visita_id` na linha -- ele so existe via join com
-- `checklists_visita`. Um check constraint nao alcanca outra tabela, entao a
-- regra entra no `with check` da policy, que ja faz exatamente esse join para
-- confirmar que o checklist e do inspetor.
--
-- A unica linha nova em relacao a 0042 e a ultima do exists; o resto e o
-- mesmo predicado, repetido porque `create policy` nao tem forma incremental.

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
        and checklist_fotos.storage_path like (c.visita_id::text || '/%')
    )
  );
