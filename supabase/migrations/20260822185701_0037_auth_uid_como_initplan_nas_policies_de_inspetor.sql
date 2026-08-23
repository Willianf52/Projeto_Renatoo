-- ============================================================================
-- VeloxLab — auth.uid() como InitPlan nas policies de INSPETOR
--
-- Achado pelo advisor de performance do Supabase (`auth_rls_initplan`,
-- 2026-08-22): as duas policies de INSERT criadas pela 0036 chamam
-- `auth.uid()` direto na cláusula `with check`, sem envolver em `(select
-- ...)`. Mesmo caso que a 0029 já corrigiu para as policies de SELECT --
-- estas duas nasceram depois e ficaram de fora do sweep.
--
-- Pesa mais aqui do que pesou lá: `visitas`/`leituras` são exatamente as
-- tabelas que recebem inserção em lote (rota de importação de coletas,
-- migration 0033), e é no lote que a reavaliação por linha aparece.
--
-- Nenhuma regra de autorizacao muda: `(select auth.uid())` e `auth.uid()`
-- retornam o mesmo valor sempre, a troca e so a forma como o planner enxerga
-- a chamada. Cada `with check` abaixo e copia exata da definicao da 0036, so
-- com essa troca mecanica -- os testes de comportamento em
-- `escrita_de_campo_por_inspetor_test.sql` continuam valendo sem alteracao.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

drop policy if exists "Inspetor grava a propria visita" on public.visitas;
create policy "Inspetor grava a propria visita" on public.visitas
  for insert to authenticated
  with check (public.e_inspetor() and funcionario_id = (select auth.uid()));

drop policy if exists "Inspetor grava leitura da propria visita" on public.leituras;
create policy "Inspetor grava leitura da propria visita" on public.leituras
  for insert to authenticated
  with check (
    public.e_inspetor()
    and exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id and v.funcionario_id = (select auth.uid())
    )
  );
