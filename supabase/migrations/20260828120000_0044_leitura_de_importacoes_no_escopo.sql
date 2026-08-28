-- ============================================================================
-- VeloxLab — Fecha a leitura de `importacoes` ao escopo da operacao
--
-- Achado A-2 da auditoria AppSec de 2026-08-28.
--
-- O PROBLEMA: a policy criada pela 0033 nao recortava nada.
--
--     create policy "Leitura para autenticados" on public.importacoes
--       for select to authenticated using (true);
--
-- "Qualquer autenticado" inclui CLIENTE, que e conta de cliente externo com
-- escopo deliberadamente estreito (0014), e INSPETOR, que e conta de campo num
-- aparelho que vive fora do escritorio (0036). Os dois liam a tabela inteira.
--
-- POR QUE ISSO IMPORTA: o conteudo nao e telemetria inocua. A coluna `detalhe`
-- recebe a lista montada em `resolverLinha` (`api/importar/coletas/route.ts`),
-- que inclui literalmente `funcionário "{email}" não está cadastrado` --
-- endereco de e-mail de funcionario -- alem de nomes de site, area, evento e
-- qualificador que nao resolveram. `origem` guarda o IP do sistema de
-- integracao.
--
-- Nenhuma tela le a tabela, o que provavelmente e por que passou batido. Isso
-- nao protegia nada: a anon key esta no bundle do painel e no APK, e
-- `GET /rest/v1/importacoes` devolvia o conteudo direto do PostgREST para
-- qualquer sessao.
--
-- O RECORTE ESCOLHIDO: `pode_ver_toda_operacao()` -- GESTOR e SUPERVISOR
-- ativos, a mesma regua que `visitas` e `leituras` usam para "enxergar a
-- operacao inteira" (0006/0014). Importacao e dado operacional agregado, nao
-- administrativo: nao ha por que exigir a regua mais estreita de
-- `pode_administrar_usuarios()`, que a tabela irma `auditoria` usa (0034)
-- porque la o conteudo e mudanca de perfil e de poder.
--
-- A escrita continua exclusiva da service_role: a 0033 ja revogou
-- INSERT/UPDATE/DELETE/TRUNCATE de anon e authenticated, e nada aqui devolve.
--
-- Idempotente: `drop policy if exists` antes do create.
-- ============================================================================

drop policy if exists "Leitura para autenticados" on public.importacoes;
drop policy if exists "Leitura da operacao" on public.importacoes;

create policy "Leitura da operacao" on public.importacoes
  for select to authenticated
  using (public.pode_ver_toda_operacao());

comment on table public.importacoes is
  'Uma linha por tentativa de lote recebida pela rota de importacao -- sucesso
   ou recusa. Leitura restrita a GESTOR/SUPERVISOR ativos (0044): `detalhe`
   pode conter e-mail de funcionario e nomes de cadastro que nao resolveram.';
