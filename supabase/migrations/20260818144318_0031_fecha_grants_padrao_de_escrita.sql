-- ============================================================================
-- VeloxLab — Fecha os grants de escrita herdados do default privilege
--
-- A migration 0010 revogou `insert, update` de `anon` em `grupos_sites` e
-- registrou o motivo com todas as letras: "uma policy futura sem
-- `to authenticated` usa `public` por padrao e liberaria escrita por
-- acidente". O raciocinio vale para as 16 tabelas restantes, que nunca
-- receberam o mesmo tratamento -- a 0010 fechou uma e o padrao nao se
-- propagou.
--
-- Confirmado nos grants reais de producao (auditoria 2026-08-18, via
-- information_schema.role_table_grants), nao no que as migrations parecem
-- dizer: `anon` e `authenticated` tinham INSERT, UPDATE, DELETE e TRUNCATE em
-- `visitas`, `leituras`, `grupos_sites_clientes`, `metas_visitas` e nas sete
-- tabelas de referencia (`areas`, `acoes`, `eventos`, `qualificadores`,
-- `motivos_visita`, `coletores_dados`, `tipos_servico`).
--
-- CAUSA RAIZ, e por isso o passo 1 e o mais importante deste arquivo: o
-- Supabase declara em pg_default_acl
--
--   alter default privileges in schema public
--     grant arwdDxtm on tables to anon, authenticated;
--
-- entao TODA tabela criada daqui em diante nasce com escrita liberada para os
-- dois papeis. As migrations 0009/0012/0015/0016 fazem o `revoke insert,
-- update` explicito e por isso estao corretas; as 0003/0004/0014 nao fizeram,
-- e as tabelas delas ficaram abertas no nivel de grant desde entao.
--
-- Nada disso era exploravel quando a auditoria rodou, e o motivo importa: as
-- tabelas afetadas tem policy apenas de SELECT, entao o RLS nega a escrita por
-- AUSENCIA de policy. Ou seja -- a unica coisa entre um operador logado e
-- forjar ou apagar `visitas`/`leituras` (o registro de inspecao, que e o
-- produto do sistema) era nao existir uma policy. Este arquivo devolve a
-- segunda camada que o projeto assume ter em todo lugar.
--
-- TRUNCATE merece nota separada: e a unica operacao de escrita que o RLS NAO
-- cobre. O Postgres nao avalia policy nenhuma num TRUNCATE -- o privilegio
-- sozinho decide. Nao ha caminho pelo PostgREST hoje (ele nao expoe TRUNCATE),
-- mas e o unico grant deste arquivo onde "o grant e pre-requisito, o RLS e o
-- portao de verdade" simplesmente nao vale.
--
-- Idempotente: revoke de privilegio ausente e no-op.
--
-- Aplicada em producao em 2026-08-18, depois do ensaio (o pgTAP
-- `grants_de_escrita_fechados_test.sql` rodado na mesma transacao que este SQL,
-- terminando em rollback: 21/21). Confirmado por SQL direto contra o banco, e
-- nao pelo retorno da aplicacao: `anon` ficou com zero privilegio de escrita em
-- qualquer tabela de public, `authenticated` com zero TRUNCATE, INSERT negado
-- em visitas/leituras/grupos_sites_clientes/profiles, e o grant de
-- `profiles.nome_completo` da 0007 intacto -- que era o risco de um revoke
-- largo demais. Smoke test das cinco telas de cadastro contra o banco ja
-- migrado: 9/9. Advisor `security` depois: nenhum achado novo.
-- ============================================================================

-- 1) Para a sangria na fonte -------------------------------------------------
-- Sem isto, cada tabela nova volta a nascer aberta e o resto deste arquivo
-- vira manutencao perpetua.
--
-- Vale para os objetos criados por `postgres`, que e o papel das migrations e
-- do SQL editor do painel. Ha uma segunda entrada em pg_default_acl para
-- `supabase_admin` no schema public que nao da para alterar daqui (so o
-- proprio dono altera os defaults dele) -- ela cobre objetos que a plataforma
-- cria, nao os desta aplicacao.

alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from anon;

-- 2) `anon` nao escreve em nada ----------------------------------------------
-- Toda escrita da aplicacao exige sessao; a importacao de coletas usa
-- service_role. Nao existe caso legitimo de escrita anonima neste sistema.
--
-- SELECT fica de proposito: revoga-lo nao acrescenta nada (o RLS ja nega, as
-- policies sao todas `to authenticated`) e mexeria numa superficie que a
-- aplicacao nao exercita, sem ganho que justifique o risco.

revoke insert, update, delete, truncate on all tables in schema public from anon;

-- 3) `authenticated` nas tabelas sem policy de escrita -----------------------
-- Lista explicita, nao `all tables`: as tabelas com escrita legitima pela tela
-- (`grupos_sites`, `sites`, `qr_codes`, `grupos_usuarios`,
-- `grupos_usuarios_membros`) tem grant por coluna vindo das 0009/0012/0015/
-- 0016/0024, e um `revoke ... on all tables` os levaria junto -- quebrando
-- todos os cadastros de uma vez.
--
-- As de baixo escrevem por service_role (`visitas`, `leituras` pela rota de
-- importacao; `grupos_sites_clientes` por `usuarios/actions.ts`) ou nao
-- escrevem por lugar nenhum ainda (`metas_visitas` e as de referencia).

revoke insert, update, delete, truncate on
  public.acoes,
  public.areas,
  public.coletores_dados,
  public.eventos,
  public.grupos_sites_clientes,
  public.leituras,
  public.metas_visitas,
  public.motivos_visita,
  public.qualificadores,
  public.tipos_servico,
  public.visitas
from authenticated;

-- 4) TRUNCATE em lugar nenhum ------------------------------------------------
-- Inclusive nas tabelas que tem escrita legitima pela tela: nenhuma operacao
-- da aplicacao trunca nada, e e o privilegio que o RLS nao cobre (ver o
-- cabecalho). `revoke truncate` nao toca nos grants de coluna de insert/update
-- das migrations anteriores.

revoke truncate on all tables in schema public from authenticated;

-- 5) `profiles`: o INSERT que nunca foi revogado -----------------------------
-- As migrations 0002 e 0007 revogaram UPDATE e devolveram apenas
-- `nome_completo`, deixando `cargo` e `ativo` fora de qualquer grant -- e o
-- comentario da 0007 diz que e isso "que impede auto-promocao de nivel de
-- acesso e auto-reativacao de conta desativada".
--
-- So que nenhuma das duas mexeu em INSERT, e o default privilege o concedeu em
-- TODAS as colunas, `cargo` e `ativo` incluidas. E a mesma escalada fechada na
-- 0002 e na 0005, entrando por outra porta: hoje barrada apenas porque
-- `profiles` nao tem policy de INSERT.
--
-- `handle_new_user()` continua funcionando: e SECURITY DEFINER (0008), roda
-- como o dono da tabela e nao depende de grant de `authenticated`.
-- DELETE entra junto pelo mesmo motivo -- nunca foi usado e nunca foi fechado.

revoke insert, delete on public.profiles from authenticated;

-- 6) `sincronizar_membros_grupo_usuarios` executavel por `anon` --------------
-- A 0026 escreveu `revoke all ... from public` seguido de `grant execute ...
-- to authenticated`, mas em producao a acl da funcao mostrava `anon=X`.
--
-- Motivo: o `revoke ... from public` nao remove grant NOMINAL, e o default
-- privilege do Supabase concede EXECUTE nominalmente a `anon` em toda funcao
-- nova. E a lição da 0027/0028 ao contrario -- la o problema foi revogar dos
-- papeis nominais e esquecer PUBLIC; aqui foi revogar de PUBLIC e esquecer o
-- papel nominal. Sao dois caminhos independentes, e uma funcao nova precisa
-- fechar os dois.
--
-- O advisor do Supabase nao acusa esta: o linter so inspeciona funcoes
-- SECURITY DEFINER, e esta e SECURITY INVOKER de proposito (ver 0026).
--
-- Nao havia vazamento: a funcao roda com o privilegio de quem chama, e o RLS
-- de `grupos_usuarios_membros` (policies `to authenticated`) nega tudo para
-- `anon`. O que havia era trabalho de banco disparavel sem autenticacao, por
-- qualquer um, via POST /rest/v1/rpc/sincronizar_membros_grupo_usuarios.

revoke execute on function public.sincronizar_membros_grupo_usuarios(bigint, uuid[])
  from anon;
