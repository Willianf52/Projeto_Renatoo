-- ============================================================================
-- VeloxLab — Escrita das perguntas do checklist (correção de rota da 0042)
--
-- A 0042 criou `perguntas_checklist` só com policy de SELECT, e o cabeçalho
-- dela registra a intenção de gravar por `service_role`, "como `cargo`/`ativo`
-- (0013) e o vínculo de cliente (0014)".
--
-- ESSA COMPARAÇÃO ESTAVA ERRADA. O que põe `cargo`, `ativo` e
-- `grupos_sites_clientes` fora do alcance de `authenticated` é que escrever
-- neles **concede acesso** -- um grant ali seria escalação de privilégio a uma
-- chamada de API de distância. O texto de uma pergunta de checklist não
-- concede nada a ninguém: é cadastro operacional comum, do mesmo tipo que
-- `grupos_sites` e `sites`, que gravam com o token da própria pessoa e deixam
-- o RLS decidir (0009/0032).
--
-- Manter a rota da 0042 custaria caro por nada: `service_role` ignora o RLS
-- inteiro, então a checagem em TypeScript viraria o **único** portão -- é o
-- que o cabeçalho de `usuarios/actions.ts` documenta ter de conviver. Trocar
-- de lado devolve a decisão para o banco e deixa este módulo idêntico aos
-- outros cinco cadastros do painel.
--
-- SEM POLICY DE DELETE E SEM GRANT DE DELETE, de propósito. Apagar pergunta
-- já respondida apagaria histórico de inspeção; `checklist_respostas.pergunta_id`
-- é `on delete restrict` (0042) e seria a última linha de defesa. Mas a
-- ausência do grant recusa antes disso, e recusa **alto**: um `delete` daqui
-- levanta `42501 permission denied` (confirmado no pgTAP), não devolve zero
-- linhas em silêncio -- que é a falha calada descrita na seção 4 da doutrina
-- de RLS deste projeto. Despublicar é `ativo = false`, que o formulário do
-- painel oferece no campo Status, e que preserva as respostas antigas
-- apontando para o texto que a pessoa de fato leu em campo.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- 1) Grants -------------------------------------------------------------------
-- Pré-requisito, não portão -- a doutrina da 0009, repetida na 0036 e na 0042.
-- `delete` fica de fora e continua revogado (ver o cabeçalho).

grant insert, update on public.perguntas_checklist to authenticated;
revoke delete, truncate on public.perguntas_checklist from authenticated;

-- 2) Policies -----------------------------------------------------------------
-- `pode_administrar_cadastros()` (0009) é a mesma régua de `grupos_sites` e
-- `sites`: GESTOR, SUPERVISOR e OPERACIONAL. Um INSPETOR lê as perguntas para
-- responder em campo (policy de SELECT da 0042) e não as edita.

drop policy if exists "Gestao cadastra pergunta do checklist" on public.perguntas_checklist;
create policy "Gestao cadastra pergunta do checklist" on public.perguntas_checklist
  for insert to authenticated
  with check (public.pode_administrar_cadastros());

-- `using` e `with check` iguais: sem o `with check`, quem pode editar poderia
-- salvar a linha num estado que ele mesmo não alcança depois. É a regra da
-- seção 6 da doutrina de RLS deste projeto, e aqui ela é trivial de cumprir
-- porque o predicado não depende de coluna nenhuma da linha.
drop policy if exists "Gestao edita pergunta do checklist" on public.perguntas_checklist;
create policy "Gestao edita pergunta do checklist" on public.perguntas_checklist
  for update to authenticated
  using (public.pode_administrar_cadastros())
  with check (public.pode_administrar_cadastros());
