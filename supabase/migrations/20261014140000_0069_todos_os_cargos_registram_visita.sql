-- ============================================================================
-- 0069 -- Todos os cargos, menos CLIENTE, enviam inspecao pelo app
--
-- O PROBLEMA. No sistema antigo quem registra coleta e checklist em campo nao
-- e so "inspetor": sao gestores, supervisores, operacionais e operadores (das
-- 15 pessoas com coletas, a maioria tem esses cargos). Aqui, a 0060 deixou
-- gravar visita, leitura e checklist so o INSPETOR e o GESTOR; SUPERVISOR,
-- OPERACIONAL e OPERADOR entravam no app, liam o QR e a fila morria no RLS. O
-- pedido do dono do produto e que todos os cargos enviem inspecao.
--
-- O QUE ENTRA:
--   - SUPERVISOR, OPERACIONAL e OPERADOR ativos gravam visita e leitura, so em
--     nome proprio (`funcionario_id = auth.uid()`), exatamente como o inspetor
--     e o gestor. Registrar em nome de outra pessoa continua fechado.
--   - Esses cargos tambem gravam o checklist (checklist, respostas, fotos e a
--     midia no bucket) da PROPRIA visita. A regra mora em
--     `pode_finalizar_visita`, que passa a perguntar "este cargo registra
--     visita?" em vez de "e INSPETOR?".
--
-- O QUE NAO MUDA:
--   - CLIENTE continua sem escrita de campo. E a conta de quem acompanha e so
--     le o escopo do cliente; com escrita, leria um QR de qualquer site e
--     gravaria visita nele. Decisao do dono em 14/10/2026.
--   - Usuario inativo continua sem gravar nada.
--   - Nenhum UPDATE/DELETE novo. Checklist enviado segue imutavel pelo app.
--   - O GESTOR continua fechando a visita de outra pessoa que ele enxerga
--     (0059). SUPERVISOR, OPERACIONAL e OPERADOR so fecham a propria.
--   - O que cada cargo ENXERGA nao muda: leem catalogos (sites, QR, perguntas)
--     todos os usuarios ativos que nao sao cliente, e as visitas seguem pela
--     `pode_ver_visita` (propria, ou toda a operacao para GESTOR e
--     SUPERVISOR).
--   - O grant por coluna e o trigger da 0054 (QR do site da visita, janela de
--     `data_hora`) valem para qualquer cargo: sao do papel `authenticated`.
--
-- Transacional e sem `begin`/`commit` explicito, pela convencao da 0041. Nenhuma
-- tabela, coluna ou policy nova: so as duas funcoes que as policies ja chamam.
-- ============================================================================

-- 1) Quem registra visita ------------------------------------------------------
-- A policy "Campo grava a propria visita" e a de leituras (0060) chamam esta
-- funcao. Trocar a lista aqui muda as duas sem reescrever policy.

create or replace function autorizacao.pode_registrar_visita()
returns boolean
language sql
security definer
stable
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.usuario_ativo()
    and autorizacao.nivel_acesso_atual() in (
      'INSPETOR', 'GESTOR', 'SUPERVISOR', 'OPERACIONAL', 'OPERADOR'
    );
$$;

comment on function autorizacao.pode_registrar_visita() is
  'Quem grava visita e leitura de campo em nome proprio: qualquer cargo ativo
   menos CLIENTE. Migration 0060, ampliada na 0069.';

revoke all on function autorizacao.pode_registrar_visita() from public;
grant execute on function autorizacao.pode_registrar_visita() to authenticated, service_role;

-- 2) Quem fecha o checklist ----------------------------------------------------
-- O ramo do dono da visita deixa de exigir `e_inspetor()` e passa a usar a
-- funcao acima: quem pode registrar a visita pode fechar a propria. O ramo do
-- GESTOR (fechar a visita de outra pessoa que ele enxerga) fica como estava.

create or replace function autorizacao.pode_finalizar_visita(id_da_visita bigint)
returns boolean
language sql
security definer
stable
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.usuario_ativo() and (
    (
      autorizacao.pode_registrar_visita()
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
   midia no bucket): o dono da visita, se o cargo dele registra visita (qualquer
   cargo ativo menos CLIENTE), ou um GESTOR ativo que a enxerga. Migration 0059,
   ampliada na 0069.';

revoke all on function autorizacao.pode_finalizar_visita(bigint) from public;
grant execute on function autorizacao.pode_finalizar_visita(bigint) to authenticated, service_role;
