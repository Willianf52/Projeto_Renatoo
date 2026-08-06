-- ============================================================================
-- VeloxLab — Tipo de usuário
--
-- A tela de Usuários do sistema de referência separa as contas em Padrão,
-- Sistema e PowerDesk, e filtra por isso. Aqui não havia onde guardar essa
-- distinção: `profiles` só tem `cargo`, que é outra coisa.
--
-- `cargo` responde "quanto esta conta enxerga e altera"; `tipo` responde "o
-- que esta conta é". Uma conta de integração pode precisar do alcance de um
-- GESTOR sem ser uma pessoa da operação -- e hoje ela apareceria na listagem
-- indistinguível de um gestor de verdade. São eixos independentes, daí a
-- coluna nova em vez de mais um valor em `profiles_cargo_check`.
--
-- `default 'PADRAO'` e `not null`: toda conta que já existe é de pessoa, e
-- deixar a coluna nula obrigaria cada leitura a decidir o que fazer com o
-- nulo. O trigger `handle_new_user` (migration 0008) não precisa mudar -- ele
-- não menciona a coluna, então o default se aplica.
--
-- Sem grant de update para `authenticated`, de propósito. É a mesma regra de
-- `cargo` e `ativo` (migrations 0002/0007): colunas que classificam a conta
-- não se escrevem pelo token da própria pessoa. Quem grava é
-- `usuarios/actions.ts`, com service_role, atrás de `podeAdministrarUsuarios()`
-- -- e como `profiles` só tem grants de update por coluna, a coluna nova já
-- nasce fechada sem precisar de revoke.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

alter table public.profiles
  add column if not exists tipo text not null default 'PADRAO';

comment on column public.profiles.tipo is
  'O que a conta e: PADRAO (pessoa), SISTEMA (integracao) ou POWERDESK.
   Ortogonal a `cargo`, que diz quanto ela enxerga e altera.';

-- Recriada em vez de `add constraint if not exists` (que o Postgres não tem
-- para check): assim a lista de valores desta migration é a que vale, mesmo
-- num banco onde uma versão anterior dela já rodou.
alter table public.profiles drop constraint if exists profiles_tipo_check;
alter table public.profiles
  add constraint profiles_tipo_check check (tipo in ('PADRAO', 'SISTEMA', 'POWERDESK'));
