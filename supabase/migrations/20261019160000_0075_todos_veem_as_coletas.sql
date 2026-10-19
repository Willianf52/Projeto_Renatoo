-- ============================================================================
-- 0075 -- Todos os cargos, menos CLIENTE, veem as coletas de todos
--
-- O PROBLEMA. No sistema antigo qualquer usuario ativo que nao e cliente ve as
-- coletas (visitas e leituras) de todos os inspetores: a restricao por usuario
-- so existe se alguem a configurar no "Vincular" (e, na pratica, ninguem
-- configurou: dos 20 usuarios, so um tem vinculo, e com o site raiz). Aqui, a
-- 0014 deixou ver a operacao inteira so o GESTOR e o SUPERVISOR; os demais
-- cargos (INSPETOR, OPERACIONAL, OPERADOR) viam so as proprias. Achado em
-- 19/10/2026: um OPERADOR abria Coletas Importadas e a lista vinha vazia.
-- Pedido do dono: todos os cargos veem as coletas de outros inspetores.
--
-- O QUE ENTRA:
--   - As policies de SELECT de `visitas` e `leituras` passam a liberar a
--     leitura a todo usuario ATIVO que nao e CLIENTE.
--   - Isso vale tambem para os relatorios que leem essas duas tabelas
--     (Visitas de Supervisao, Registro de Rondas, Ranking, Mapa, Horas por
--     Usuario, Inicio e Fim de Visita): sao funcoes SECURITY INVOKER, entao
--     seguem o RLS de quem chama.
--
-- O QUE NAO MUDA:
--   - CLIENTE continua vendo so o recorte dos grupos de sites dele (0014). Um
--     cliente ver os dados de outro cliente seria vazar contrato.
--   - Usuario inativo continua sem ver nada.
--   - Nenhuma escrita muda: quem grava visita e leitura segue sendo o dono, em
--     nome proprio (0060 e 0069), e fechar visita alheia continua sendo do
--     GESTOR (0059).
--   - `pode_ver_visita` NAO muda: o checklist, as respostas, as fotos, a midia,
--     as ocorrencias e os andamentos da visita seguem como estavam (dono,
--     GESTOR e SUPERVISOR, ou o recorte do cliente). Abrir esses para todos
--     exporia, entre outros, os e-mails externos das ocorrencias; e outro
--     pedido, e nao este.
--   - O app de campo ja filtra "minhas visitas" por `funcionario_id` para todo
--     cargo que registra visita, menos o GESTOR (`listaSoAsMinhas`): a lista do
--     inspetor no aparelho nao passa a mostrar visita alheia.
--
-- Sem tabela, coluna ou funcao nova: so as duas policies. Transacional e sem
-- `begin`/`commit` explicito, pela convencao da 0041.
-- ============================================================================

-- 1) Visitas -------------------------------------------------------------------
-- O primeiro ramo substitui `pode_ver_toda_operacao()` (GESTOR e SUPERVISOR, que
-- sao subconjunto de "ativo e nao cliente"). O ramo do dono fica: um usuario
-- rebaixado a CLIENTE continua vendo as visitas que ele mesmo gravou.

drop policy if exists "Leitura da operacao no escopo" on public.visitas;
create policy "Leitura da operacao no escopo" on public.visitas
  for select to authenticated
  using (
    ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()))
    or (autorizacao.usuario_ativo() and funcionario_id = (select auth.uid()))
    or (autorizacao.e_cliente() and exists (
      select 1 from public.sites s
      where s.id = visitas.site_id and autorizacao.pode_ver_grupo_site(s.grupo_site_id)
    ))
  );

-- 2) Leituras ------------------------------------------------------------------
-- Mesmo criterio da visita a que a leitura pertence.

drop policy if exists "Leitura das leituras no escopo" on public.leituras;
create policy "Leitura das leituras no escopo" on public.leituras
  for select to authenticated
  using (
    ((select autorizacao.usuario_ativo()) and not (select autorizacao.e_cliente()))
    or exists (
      select 1 from public.visitas v
      where v.id = leituras.visita_id
        and (
          (autorizacao.usuario_ativo() and v.funcionario_id = (select auth.uid()))
          or (autorizacao.e_cliente() and exists (
            select 1 from public.sites s
            where s.id = v.site_id and autorizacao.pode_ver_grupo_site(s.grupo_site_id)
          ))
        )
    )
  );
