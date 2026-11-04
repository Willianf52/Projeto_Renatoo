-- ============================================================================
-- 0091: foto obrigatoria em todas as perguntas, por modelo de checklist
--
-- POR QUE EXISTE (04/11/2026): testando o sistema antigo, o dono viu que nos
-- checklists dos carros da empresa a foto e obrigatoria em TODAS as perguntas,
-- e nos demais nao. Aqui a foto por pergunta e sempre opcional (decisao de
-- 03/11); passa a ser uma opcao do modelo, como `exige_aprovacao`.
--
-- O app de campo e quem exige: com a opcao ligada, o checklist so fecha depois
-- que cada pergunta tem ao menos uma foto. O banco so guarda a opcao.
--
-- Liga para o unico modelo dos carros hoje, "Check List Frota Operacional".
-- Os outros ficam desligados, que e o comportamento de antes.
-- ============================================================================

alter table public.modelos_checklist
  add column if not exists foto_obrigatoria boolean not null default false;

comment on column public.modelos_checklist.foto_obrigatoria is
  'Quando verdadeiro, o app de campo exige ao menos uma foto em TODAS as
   perguntas do modelo antes de fechar o checklist (0091). Falso: a foto por
   pergunta e opcional.';

update public.modelos_checklist
   set foto_obrigatoria = true
 where nome = 'Check List Frota Operacional';
