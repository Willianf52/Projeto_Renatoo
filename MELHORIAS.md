# Melhorias do Sistema — Revisão Fullstack

Levantamento feito lendo middleware, RLS, fluxo de auth e as telas do dashboard.
Organizado por prioridade. Cada item cita o arquivo/linha onde o problema
aparece hoje.

> Última revisão: 2026-08-06. A lista foi podada do que já entrou — o histórico
> fica em "Itens fechados", no fim, para não reabrir discussão já resolvida.
> Segurança tem documento próprio (`AUDITORIA-SEGURANCA.md`); aqui só entra o
> que não é achado de auditoria.
>
> **A numeração é sequencial e muda a cada revisão** — markdown renumera lista
> ordenada sozinho, então não adianta tentar preservar o número de um item
> fechado. Por isso a tabela do fim identifica cada item pelo nome, não pelo
> número, e referência entre itens também: número aqui não é identificador.
>
> Esta revisão mudou o ângulo: até aqui a lista media o projeto contra si mesmo
> (o que está construído está bem construído?). Passou a medi-lo contra o
> sistema de referência — **o que ainda não existe**. Daí os itens novos de
> alta prioridade serem todos de ausência, não de defeito.

## Alta prioridade

1. **`Usuários` é só leitura — o sistema não consegue admitir ninguém.**
   `usuarios/page.tsx` lista e filtra, mas não tem "novo", "editar" nem
   ativar/desativar. Combinado com a 0008 (conta nova nasce inativa e
   `OPERADOR`), **ativar um usuário novo só é possível pelo painel do
   Supabase**. No sistema de referência é um cadastro completo. Precisa de
   server actions com `service_role`: `cargo` e `ativo` estão revogadas de
   `authenticated` pelas migrations 0002/0003/0007, e devem continuar — o
   caminho é uma rota de servidor que verifica `pode_administrar_cadastros()`
   antes de escrever, não afrouxar o grant.

2. **`CLIENTE` é um nível de acesso que não faz nada.** Está no `check` da 0003
   e é selecionável no filtro (`usuarios/queries.ts:13`), mas não aparece em
   policy nenhuma. Como `pode_ver_toda_operacao()` é só GESTOR/SUPERVISOR e a
   policy de `visitas` (0006) cai em `funcionario_id = auth.uid()`, **um
   CLIENTE loga e vê a tela de coletas vazia** — não "restrita": vazia, sem
   explicar por quê. No sistema de referência o cliente vê as coletas do
   próprio grupo de sites. Falta o vínculo: `profiles` não tem
   `grupo_site_id` nem tabela de escopo. É paridade e é segurança ao mesmo
   tempo. `OPERACIONAL` tem meia-vida melhor: aparece na 0009, mas em nenhuma
   policy de leitura.

3. **Dois cadastros ainda são placeholder.** `grupo-de-usuarios` e `qr-code`
   são 11 linhas de `TelaEmPreparacao` cada. As tabelas já existem
   (`grupos_usuarios`, `grupos_usuarios_membros`, `qr_codes`) — o modelo está
   pronto, falta a tela. `qr-code` é o mais urgente dos dois: a rota de
   importação resolve `checkpoint` por código, e hoje o QR só entra por SQL ou
   pelo `seed.sql`.

## Média prioridade

4. **Filtros de `coletas-importadas` com semântica assumida, não confirmada.**
   "Localização" foi interpretado como presença/ausência de coordenadas na
   leitura (`leituras.latitude`), "Tipo" como `tipos_servico` do site e
   "Checkpoint" como `qr_codes`. Se o sistema de referência (UP Serviços) usa
   esses campos com outro significado, os filtros restringem errado em
   silêncio. Confirmar com quem conhece a tela original antes de considerar a
   página fechada.

5. **`/dashboard` não tem tela própria.** `app/dashboard/page.tsx` redireciona
   para a listagem de coletas. `metas_visitas` existe desde a 0004, tem policy
   de leitura e **nada a consulta** — a própria migration cita o gráfico
   "Visitas Realizadas x Não Realizadas" que ela alimentaria. Um painel
   inicial é o que falta para a tabela deixar de ser peso morto.

6. **Coluna "Ações" vazia em Coletas Importadas.**
   `coletas-importadas/page.tsx:49` empurra `""` em toda linha. Cabeçalho sem
   conteúdo é pior que coluna ausente: promete uma ação que não existe. Ou
   ganha o "ver detalhes" da tela original, ou sai da lista de colunas.

7. **`Eventos`, `ChecklistLab` e `Suporte` no menu, desabilitados.**
   `DashboardSidebar.tsx:63-65` — mantidos visíveis de propósito, para
   preservar a estrutura de navegação do sistema de referência. Não têm tabela
   nem tela. Ficam aqui para não se perderem de vista.

## Baixa prioridade / nice-to-have

8. **`package-lock.json` local.** Está no `.gitignore` e não é rastreado, então
   não é problema de repositório — mas existe na máquina de desenvolvimento e é
   exatamente a divergência npm/pnpm que a auditoria registra como já tendo
   causado dor. **A nota anterior de que não havia `pnpm` neste ambiente estava
   errada**: `npx pnpm@11.18.0` funciona, e foi como o `pnpm-lock.yaml` voltou
   a bater com o `package.json` nesta revisão. Apagar o `package-lock.json`
   local resolveria o resto.

9. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

10. **`console.error` sem destino de observabilidade.** As linhas de
    `lib/supabase/middleware.ts`, `lib/perfil-atual.ts`, `lib/permissoes.ts` e
    das rotas de API agora carregam um id de correlação (`lib/log.ts` — ver
    "Itens fechados"), mas o destino continua sendo só o stdout do servidor.
    Mandar para um serviço (Sentry, Datadog etc.) exige credencial e serviço
    externos que este ambiente não tem. O `TODO` em
    `app/dashboard/error.tsx:13` marca o lugar de plugar isso quando existir.

11. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

12. **Leitura sem `area` escapa da deduplicação da importação.** No Postgres,
    índice único não considera dois `NULL` iguais, então a constraint
    `unique (visita_id, area_id, data_hora)` da 0004 não segura leitura sem
    área: ela entra de novo a cada reenvio do lote. Resolve com
    `nulls not distinct` na constraint. Registrado em
    `docs/importacao-de-coletas.md` e no comentário da própria rota.

---

## Itens fechados

Registrados para não voltarem à lista. Identificados pelo nome: o número que
tinham na revisão em que foram levantados não vale mais nada depois que a lista
renumera.

| Item | Como ficou |
|---|---|
| `visitas`/`leituras` sem caminho de entrada | `POST /api/importar/coletas` (`app/api/importar/coletas/route.ts` + `lib/importar-coletas.ts`, com 34 testes). As migrations 0003/0004 registravam que a escrita "ocorre no servidor com service_role" — mas a rota nunca existiu, e a tela de Coletas Importadas listava vazio em qualquer ambiente novo: os 14 filtros, a paginação e as duas exportações estavam construídos sobre uma tabela que nada alimentava. Formato achatado (uma linha por leitura, referências por nome), autenticação por segredo compartilhado como o webhook. Contrato em `docs/importacao-de-coletas.md`. **Não exercitado contra banco de verdade** — mesma lacuna do pgTAP |
| `seed.sql` vazio | Semeia as tabelas de referência que a 0004 não cobre (`eventos`, `acoes`, `qualificadores`, `tipos_servico` — select de filtro vazio parece defeito de tela, não tabela sem cadastro) e um grupo de sites com unidades e QR codes, para a importação ter em que se apoiar. Não semeia `visitas`/`leituras` de propósito: mascararia uma importação quebrada com uma tela cheia |
| `Site / Planta` era placeholder | Cadastro completo: listagem com busca livre (nome/sigla/cidade) e filtros de grupo, tipo de serviço e situação; formulário de criar/editar; exportar Excel e PDF. Migration 0012 dá a `sites` o mesmo padrão de escrita que a 0009 deu a `grupos_sites` (grant por coluna + policy em `pode_administrar_cadastros()`), acrescenta `unique (grupo_site_id, nome)`, faz `criado_por` vir de `auth.uid()` por default — para não poder ser forjada — e cobre a busca com índices trigram. Era o placeholder mais crítico: `sites` é o "Local" de toda coleta e do filtro `Locais` |
| `podeAdministrarCadastros` presa dentro de uma tela | Subiu para `lib/permissoes.ts` quando Site / Planta passou a precisar da mesma regra; a alternativa era a segunda tela importar de dentro da pasta da primeira. Mesmo movimento que `escaparLike` → `lib/postgrest-escape.ts`. Testes junto, em `lib/permissoes.test.ts` |
| `pnpm-lock.yaml` fora de sincronia | `@playwright/test` entrou na revisão anterior sem atualizar o lock, e o próximo push quebraria o CI no `--frozen-lockfile`. Resolvido com `npx pnpm@11.18.0 install --lockfile-only` |
| Cookies renovados perdidos no redirect | `preservarSessao()` em `lib/supabase/middleware.ts`, com teste de regressão |
| Cache de referências guardava falha | `getReferenciasCompartilhadas` não grava no cache se alguma consulta trouxe `error` |
| CI não rodava em push para `main` | Gatilho apontado para `branches: [main]`. Falta marcar o job como required em branch protection — só dá para fazer na UI do GitHub |
| Botão "Sair" podia não sair | `DashboardNavbar` checa o retorno de `signOut()`, avisa na tela e libera o botão. Corrigiu junto um segundo defeito: `signingOut` nunca voltava a `false`, então numa falha o botão travava em "Saindo...". Coberto por Playwright hoje só indiretamente (o fluxo de login, não o de logout) |
| Três consultas a `profiles` por requisição | Duas saíram quando `podeAdministrarCadastros()` e `podeVerTodaOperacao()` viraram chamadas RPC às funções `security definer` do banco. A do layout virou `lib/perfil-atual.ts`, memoizada por requisição com `cache()` do React — o ponto não é o número de round-trips hoje, é que tela nova reusa em vez de abrir a sua. A do middleware fica: roda em invocação separada do render, e nenhum cache de requisição atravessa as duas |
| A regra de autorização duplicada em TS e em SQL | `podeAdministrarCadastros()` e `podeVerTodaOperacao()` (`usuarios/queries.ts`, ex-`getNivelAcessoAtual`/`podeVerTodosOsUsuarios`) passaram a chamar `pode_administrar_cadastros()`/`pode_ver_toda_operacao()` via RPC em vez de reimplementar a regra em TS a partir de `cargo`/`ativo`. Fonte única; teste cobre concessão, negação e falha do RPC negando por padrão. O round-trip a menos é o mesmo citado em "Três consultas a `profiles`" |
| `error.tsx`/`not-found.tsx` só no nível do dashboard | `app/error.tsx` e `app/not-found.tsx`, seguindo a identidade visual do login (fundo `brand-navy`, logo, sem depender do `DashboardChrome`) |
| Índices não cobrem buscas nem ordenação real | `supabase/migrations/0011_indices_de_busca_e_ordenacao.sql`: GIN + `pg_trgm` para os `ilike` de `grupos_sites`/`profiles`, índice composto `(data_hora desc, id desc)` em `leituras` no lugar do de coluna única da 0004, e índice em `profiles.nome_completo`. A 0012 estendeu o mesmo tratamento a `sites`. Não testado contra banco local — mesma lacuna do `config.toml` que as policies de RLS tinham (ver abaixo) |
| `combinarDataHora` sem timezone explícito | Deslocamento `-03:00` fixo no timestamp montado (Brasil não observa horário de verão desde 2019, então o deslocamento não varia), com teste cobrindo os três casos (`combinarDataHora`, exportada de `coletas-importadas/queries.ts`). A importação exige o mesmo, pelo mesmo motivo: recusa timestamp sem fuso |
| `packageManager` ausente no `package.json` | Campo `"packageManager": "pnpm@11.18.0"` adicionado; `pnpm/action-setup` no CI não crava mais `version:` — lê do `package.json`, então local e CI não podem mais divergir |
| Cliente Supabase do browser recriado a cada chamada | Singleton de módulo em `lib/supabase/client.ts`: `createClient()` memoiza a instância entre chamadas |
| Botão desabilitado não alcança quem usa teclado | Componente único `components/dashboard/AcaoDesabilitada.tsx`, com `aria-disabled` + `onClick` no-op no lugar do atributo `disabled`, que preserva o foco por teclado. Precisou de `"use client"`: o `onClick` é uma função, e função não atravessa o limite servidor/cliente sem a diretiva |
| `escaparLike` duplicado nas duas telas | Virou `lib/postgrest-escape.ts`, com teste próprio. `escaparPostgrest` foi junto, e a composição dos dois virou `termoParaOr` — a ordem entre eles não é intercambiável e agora está fixada num lugar só |
| As policies de RLS não tinham um teste sequer | `supabase/config.toml` criado (via `supabase init`) e quatro suites pgTAP em `supabase/tests/database/`: conta nova nasce inativa/OPERADOR mesmo forjando `raw_user_meta_data` (0005/0008), OPERADOR não lê perfil alheio e GESTOR/SUPERVISOR ativos leem (0006), `anon` não escreve em `grupos_sites` (0010), UPDATE em `cargo`/`ativo` negado para `authenticated` (0007). **Não executado neste ambiente** — sem Docker para `supabase start`. Rodar com `pnpm test:db` antes de confiar |
| Nenhum teste de ponta a ponta do fluxo de auth | Playwright instalado (`e2e/`, `playwright.config.ts`, `pnpm test:e2e`). Seis specs rodam sem credencial nenhuma e passam. Login → dashboard e conta inativa barrada estão escritos mas pulam sozinhos sem `E2E_EMAIL`/`E2E_PASSWORD`/`E2E_INACTIVE_EMAIL`/`E2E_INACTIVE_PASSWORD`. Fora do CI de propósito: rodar contra o Supabase real consome o rate limit de auth dele a cada push |
| Botões de exportar Excel/PDF sem handler | "Exportar para Excel" virou CSV (`lib/csv.ts` — ponto e vírgula como separador e BOM UTF-8, para abrir certo no Excel em pt-BR); "Exportar para PDF" é uma tela de impressão (`components/dashboard/TabelaImpressao.tsx` + `ImprimirAoAbrir`) que dispara `window.print()`. As rotas respeitam o mesmo filtro da listagem, com teto de 2000 linhas e aviso de truncamento. Site / Planta nasceu já com as duas |
| `console.error` sem correlação | `lib/log.ts`: cada log do middleware, `perfil-atual.ts` e das rotas de API carrega um id curto por requisição/invocação. O destino (mandar para um serviço externo) segue em aberto — linha própria na lista acima |
| Envs sem validação, erro genérico | `lib/env.ts`, com mensagem apontando o `.env.example`. A `service_role` fica de fora de propósito: é lida sob demanda em `lib/supabase/admin.ts`, para um projeto sem importação configurada continuar subindo |
| Sem testes nem CI | vitest + `.github/workflows/ci.yml` (lint, typecheck, teste, build) |
| Sem `error.tsx` | `app/dashboard/error.tsx` — o par em `app/` fechou junto (ver acima) |
| Sem `loading.tsx` | `app/dashboard/loading.tsx` |
| `.single()` vs `.maybeSingle()` | Layout passou a usar `maybeSingle`, com o motivo no comentário |
| Sem feedback de tentativas no login | Bloqueio de 30s após 5 falhas em `components/LoginForm.tsx` |

**Decisão de produto, não pendência:** a troca de senha não exige a senha atual
(commit `778c869`). O risco está descrito em `AUDITORIA-SEGURANCA.md` (A07) —
quem alcança uma sessão aberta troca a senha e tranca o dono para fora. A
mitigação seria o e-mail de aviso, que hoje não chega a ninguém porque o
remetente ainda é `onboarding@resend.dev` (`lib/resend.ts:29`), que só entrega
ao dono da conta Resend.

**O que nada nesta revisão pôde verificar:** nenhuma migration, policy ou
consulta desta rodada rodou contra um Postgres de verdade — não há Docker
neste ambiente para `supabase start`. Vale para a 0012, para o `seed.sql` e
para a rota de importação inteira, que passa 34 testes de formato e zero de
integração. `pnpm test:db` e um `curl` contra o ambiente local são o próximo
passo antes de confiar em qualquer um dos três.
