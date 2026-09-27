-- ============================================================================
-- 0060 -- GESTOR tambem registra visita e leitura (o QR lido no app)
--
-- O PROBLEMA. A 0059 deixou o GESTOR fechar visita, mas so a de alguem: abrir
-- uma continuava exclusivo do INSPETOR (policies da 0036, reescritas na 0037).
-- Com o leitor de QR no botao "Inspecao" do app, o gestor le a etiqueta, a
-- fila grava a visita e a leitura no aparelho -- e a sincronizacao morria no
-- RLS, com a ronda presa na fila para sempre. O pedido do dono do produto e
-- "gestor consegue fazer as inspecoes", e fazer comeca por ler o QR.
--
-- O QUE ENTRA:
--   - GESTOR ativo grava visita, mas so em nome proprio
--     (`funcionario_id = auth.uid()`), exatamente como o inspetor. Registrar
--     visita em nome de outra pessoa continua fechado para todo mundo.
--   - GESTOR ativo grava leitura, mas so na visita dele.
--
-- O QUE NAO MUDA:
--   - SUPERVISOR, OPERACIONAL, OPERADOR e CLIENTE continuam sem escrita de
--     campo -- o mesmo recorte da 0059.
--   - O grant por coluna e o trigger da 0054 (QR do site da visita, janela de
--     `data_hora`) valem para qualquer cargo: sao do papel `authenticated`,
--     nao da policy.
--   - Nenhum UPDATE/DELETE novo.
-- ============================================================================

-- 1) A regra num lugar so ------------------------------------------------------
-- As duas policies abaixo perguntam a mesma coisa ("este cargo registra
-- visita?"). Numa funcao, a proxima mudanca de cargo e uma linha, e nao duas
-- policies para manter iguais -- o mesmo motivo de `pode_finalizar_visita`.

create or replace function autorizacao.pode_registrar_visita()
returns boolean
language sql
security definer
stable
set search_path = autorizacao, public, pg_temp
as $$
  select autorizacao.usuario_ativo()
    and autorizacao.nivel_acesso_atual() in ('INSPETOR', 'GESTOR');
$$;

comment on function autorizacao.pode_registrar_visita() is
  'Quem grava visita e leitura de campo em nome proprio: INSPETOR ou GESTOR
   ativo. Migration 0060.';

revoke all on function autorizacao.pode_registrar_visita() from public;
grant execute on function autorizacao.pode_registrar_visita() to authenticated, service_role;

-- 2) As policies ----------------------------------------------------------------
-- Nome novo porque o antigo ("Inspetor grava ...") passaria a mentir. O
-- `(select auth.uid())` segue como initplan, pelo motivo da 0037.

drop policy if exists "Inspetor grava a propria visita" on public.visitas;
drop policy if exists "Campo grava a propria visita" on public.visitas;
create policy "Campo grava a propria visita" on public.visitas
  for insert to authenticated
  with check (
    autorizacao.pode_registrar_visita()
    and funcionario_id = (select auth.uid())
  );

drop policy if exists "Inspetor grava leitura da propria visita" on public.leituras;
drop policy if exists "Campo grava leitura da propria visita" on public.leituras;
create policy "Campo grava leitura da propria visita" on public.leituras
  for insert to authenticated
  with check (
    autorizacao.pode_registrar_visita()
    and exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id
        and v.funcionario_id = (select auth.uid())
    )
  );
