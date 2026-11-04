-- ============================================================================
-- 0092: quantidade de assinaturas por modelo de checklist
--
-- POR QUE EXISTE (04/11/2026): a 0090 passou todo checklist para DUAS
-- assinaturas. O dono viu que no antigo o checklist dos carros pede UMA so
-- (a pessoa informa o nome e assina), e os demais seguem com duas. Vira opcao
-- do modelo, como `foto_obrigatoria` (0091).
--
-- O app de campo e quem exige: cobra a quantidade do modelo escolhido. O banco
-- so guarda a opcao -- `registrar_checklist` (0090) ja aceita 1 a 5 assinaturas,
-- entao nao muda.
--
-- Padrao 2 (comportamento de hoje). Liga 1 para o modelo dos carros.
-- ============================================================================

alter table public.modelos_checklist
  add column if not exists quantidade_de_assinaturas smallint not null default 2
    constraint modelos_checklist_quantidade_de_assinaturas_check
    check (quantidade_de_assinaturas between 1 and 2);

comment on column public.modelos_checklist.quantidade_de_assinaturas is
  'Quantas assinaturas o app de campo exige para fechar um checklist deste modelo (0092): 1 ou 2. Padrao 2.';

update public.modelos_checklist
   set quantidade_de_assinaturas = 1
 where nome = 'Check List Frota Operacional';
