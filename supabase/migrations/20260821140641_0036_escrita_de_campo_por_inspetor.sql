-- ============================================================================
-- VeloxLab — Escrita de campo por INSPETOR
--
-- Até aqui `visitas`/`leituras` só recebiam escrita de `service_role`, pela
-- rota de importação em lote (migrations 0003/0004). O app móvel muda isso:
-- o inspetor passa a autenticar com sessão própria e gravar a própria ronda
-- em tempo real. Ver o plano "Abrindo o Portão" (marco 01+02).
--
-- CARGO, NÃO UM EIXO NOVO -- `cargo` já responde "quanto esta conta enxerga e
-- altera" (comentário da migration 0019), e a permissão de gravar leitura de
-- campo é exatamente uma resposta nova a essa pergunta. Diferente de `tipo`
-- (0019, "o que a conta é" -- pessoa/integração), que seria o eixo errado
-- para isto.
--
-- ESCOPO NASCE DO QR, NÃO DE TABELA DE VÍNCULO -- `qr_codes.site_id` já
-- amarra o código ao site; escanear um QR válido em campo já é a prova de
-- presença física que autorizaria a escrita naquele site. Uma tabela
-- inspetor↔site seria redundante com isso, e só entraria se um dia for
-- preciso restringir por regional/cliente além do que o QR resolve.
--
-- SÓ INSERT, DE PROPÓSITO -- decisão de produto (2026-08-21): o app não
-- permite editar leitura já enviada nesta fase. Corrigir um erro de campo
-- continua sendo tarefa de quem administra, pelo portal web. Sem policy de
-- UPDATE/DELETE aqui; entram quando essa decisão mudar, junto com a extensão
-- da trilha de auditoria (migration 0034) para estas duas tabelas.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Cargo novo ---------------------------------------------------------------
-- Recriada, não `add constraint if not exists` (que o Postgres não tem para
-- check): a lista desta migration é a que vale, mesmo num banco onde uma
-- versão anterior já rodou. Mesmo padrão da 0003/0019.

alter table public.profiles drop constraint if exists profiles_cargo_check;
alter table public.profiles
  add constraint profiles_cargo_check
  check (cargo in ('OPERADOR', 'CLIENTE', 'GESTOR', 'OPERACIONAL', 'SUPERVISOR', 'INSPETOR'));

-- 2) Helper ---------------------------------------------------------------------
-- Mesmo formato de `e_cliente()` (0014): combina `usuario_ativo()` com
-- `nivel_acesso_atual()`, security definer, stable.

create or replace function public.e_inspetor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_ativo() and public.nivel_acesso_atual() = 'INSPETOR';
$$;

comment on function public.e_inspetor() is
  'Verdadeiro quando o usuario atual e um INSPETOR ativo -- o unico nivel com
   permissao de gravar visitas/leituras pelo token da propria sessao.';

revoke all on function public.e_inspetor() from public;
grant execute on function public.e_inspetor() to authenticated;

-- 3) Grants de escrita ----------------------------------------------------------
-- A 0031 revogou INSERT/UPDATE/DELETE/TRUNCATE de `authenticated` nas duas
-- tabelas (RLS era o unico portao, sem grant nenhum atras -- por isso o
-- revoke la existia so por defesa em profundidade). Devolve so INSERT: grant
-- e pre-requisito, a policy abaixo (passo 4) e o portao de verdade -- mesma
-- doutrina da 0009.

grant insert on public.visitas to authenticated;
grant insert on public.leituras to authenticated;

-- 4) Policies de INSERT -----------------------------------------------------------
-- `visitas`: o inspetor so grava visita em nome de si mesmo -- sem isto,
-- qualquer INSPETOR poderia forjar uma ronda em nome de outro funcionario.
--
-- `leituras`: a leitura precisa apontar para uma visita que ja e do proprio
-- inspetor (gravada no mesmo fluxo, com o check acima). Sem essa segunda
-- checagem, um INSPETOR poderia pendurar leitura numa visita alheia.

drop policy if exists "Inspetor grava a propria visita" on public.visitas;
create policy "Inspetor grava a propria visita" on public.visitas
  for insert to authenticated
  with check (public.e_inspetor() and funcionario_id = auth.uid());

drop policy if exists "Inspetor grava leitura da propria visita" on public.leituras;
create policy "Inspetor grava leitura da propria visita" on public.leituras
  for insert to authenticated
  with check (
    public.e_inspetor()
    and exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id and v.funcionario_id = auth.uid()
    )
  );

-- Nota sobre leitura (SELECT): nenhuma policy nova precisa entrar aqui. As
-- policies de leitura da 0006/0014 ja tem o ramo "usuario_ativo() and
-- funcionario_id = auth.uid()" para qualquer cargo -- um INSPETOR ativo lendo
-- a propria visita ja cai nesse ramo, sem depender do valor do cargo.
