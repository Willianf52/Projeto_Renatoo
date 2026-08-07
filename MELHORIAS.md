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
>
> Rodada seguinte: o painel inicial (item 1) foi construído e depois retirado
> a pedido nesta mesma sessão — fica registrado como estava, não fechado. Os
> itens 3, 5, 9 e 10 entraram em "Itens fechados". O item 2 segue aberto por
> depender de confirmação externa (quem conhece a tela original) que este
> ambiente não tem como obter sozinho.
>
> 2026-08-07: confirmado com o dono do produto que `/dashboard` cair direto em
> Coletas Importadas **é o comportamento esperado**, não uma lacuna — o item
> "painel inicial" saiu de "Alta prioridade" e foi para "Itens fechados" como
> decisão de produto, não pendência técnica.

## Alta prioridade

Nenhum item aberto nesta categoria no momento.

## Média prioridade

2. **Filtros de `coletas-importadas` com semântica assumida, não confirmada.**
   "Localização" foi interpretado como presença/ausência de coordenadas na
   leitura (`leituras.latitude`), "Tipo" como `tipos_servico` do site e
   "Checkpoint" como `qr_codes`. Se o sistema de referência (UP Serviços) usa
   esses campos com outro significado, os filtros restringem errado em
   silêncio. Confirmar com quem conhece a tela original antes de considerar a
   página fechada.

3. **`Eventos`, `ChecklistLab` e `Suporte` no menu, desabilitados.**
   `DashboardSidebar.tsx:63-65` — mantidos visíveis de propósito, para
   preservar a estrutura de navegação do sistema de referência. Não têm tabela
   nem tela. Ficam aqui para não se perderem de vista.

## Baixa prioridade / nice-to-have

4. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

5. **`console.error` sem destino de observabilidade.** As linhas de
    `lib/supabase/middleware.ts`, `lib/perfil-atual.ts`, `lib/permissoes.ts` e
    das rotas de API agora carregam um id de correlação (`lib/log.ts` — ver
    "Itens fechados"), mas o destino continua sendo só o stdout do servidor.
    Mandar para um serviço (Sentry, Datadog etc.) exige credencial e serviço
    externos que este ambiente não tem. O `TODO` em
    `app/dashboard/error.tsx:13` marca o lugar de plugar isso quando existir.

6. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

---

## Itens fechados

Registrados para não voltarem à lista. Identificados pelo nome: o número que
tinham na revisão em que foram levantados não vale mais nada depois que a lista
renumera.

| Item | Como ficou |
|---|---|
| `/dashboard` sem tela própria (painel inicial) | Confirmado com o dono do produto em 2026-08-07: cair direto em Coletas Importadas ao entrar no sistema **é o comportamento esperado**, não uma ausência a preencher. `metas_visitas` segue sem consulta nenhuma, mas deixa de ser tratado como pendência — só volta à lista se o critério de produto mudar |
| Coluna "Ações" vazia em Coletas Importadas | Não havia ação real para colocar nela — a única candidata (mostrar a coordenada exata da leitura, hoje só usada como presença/ausência no filtro "Localização") foi descartada por decisão de produto. A coluna saiu de `TABLE_COLUMNS`, e `toTableRow` passou a ser a lista completa de campos da linha, sem mais precisar de tratamento especial na página |
| `package-lock.json` local | Apagado da máquina de desenvolvimento — estava fora do controle de versão (`.gitignore`), então a divergência com `pnpm-lock.yaml` não afetava o repositório, só o ambiente local |
| QR-Code não gerava a imagem do QR | Biblioteca `qrcode` adicionada (`lib/qrcode.ts`, PNG em data URL — mais simples e mais seguro que embutir SVG cru). A tela de editar QR-Code mostra o código renderizado para conferência, e o botão "Imprimir Etiquetas" (`export/etiquetas`, componente `FolhaDeEtiquetas`) gera uma folha para impressão com todos os QR do filtro atual — mesmo mecanismo de `ImprimirAoAbrir` que "Exportar para PDF" já usava, mas em grade de cartões em vez de tabela |
| Leitura sem `area` escapava da deduplicação da importação | Migration 0017: a constraint `unique (visita_id, area_id, data_hora)` da 0004 recriada com `nulls not distinct`, para que dois `NULL` em `area_id` colidam como duplicata igual já acontecia com o campo preenchido. `onConflict` da rota de importação não mudou — mesmas colunas, mesmo nome de constraint. pgTAP em `leitura_sem_area_dedup_test.sql` cobre a colisão e o caso que não deveria colidir (instantes diferentes) |
| `Grupo de Usuários` era placeholder — o último do menu | Cadastro completo com seleção de membros (checkboxes com filtro local) + migration 0016. A regra de quem administra **não** é a das 0009/0012/0015, e a diferença é o ponto: `pode_administrar_cadastros()` inclui OPERACIONAL, mas o conteúdo deste cadastro é a lista de pessoas — e a policy da 0006 só devolve a operação inteira para quem `pode_ver_toda_operacao()`. Com apenas o primeiro predicado, um OPERACIONAL criaria um grupo e não veria um único membro para colocar dentro: escrita autorizada sobre dado que ele não alcança. Daí `pode_administrar_grupos_usuarios()` ser a conjunção das duas — colapsa hoje em GESTOR + SUPERVISOR, mas continua correta se qualquer uma das listas mudar. Membros são apagados e recriados a cada salvamento em vez de diferenciados: a tabela é só a chave primária, não há nada a preservar, e o diff custaria um round-trip a mais para chegar no mesmo lugar |
| `QR-Code` era placeholder | Cadastro completo (listagem com busca e filtros de site/grupo/situação, criar/editar, exportar Excel e PDF) + migration 0015 com o padrão de escrita das 0009/0012. Era o mais urgente dos dois porque a rota de importação resolve `checkpoint` pelo código do QR e recusa o lote quando ele não existe — o cadastro era pré-requisito sem tela. Duas decisões próprias: o código só aceita letras, números, ponto, hífen e sublinhado (ele é lido de etiqueta e casado por texto na importação; espaço no meio sobrevive ao `trim` das bordas e produz um cadastro que parece certo na tela e nunca casa com o lote), e a policy de escrita exige `pode_ver_grupo_site()` além de `pode_administrar_cadastros()` — hoje redundante, mas impede que uma combinação futura de nível com escopo pendure checkpoint num site que nem enxerga |
| `CLIENTE` era um nível de acesso que não fazia nada | Migration 0014: tabela `grupos_sites_clientes` (N:N — um contato de holding acompanha mais de um grupo, e começar 1:1 obrigaria a migrar dado depois), helpers `e_cliente()`/`pode_ver_grupo_site()`, e as policies de `grupos_sites`, `sites`, `qr_codes`, `visitas` e `leituras` reescritas para recortar por grupo. Antes disso um CLIENTE logava e via a tela de coletas **vazia** — não "restrita": vazia, sem explicar por quê. Era paridade **e** segurança: as policies das três tabelas de cadastro eram `usuario_ativo()` puro, então ativar um CLIENTE pela tela nova de Usuários entregaria a ele os sites de todos os clientes, com coordenadas, mais o código de todo checkpoint — o mesmo vazamento que a 0008 fechou para conta criada de fora. O predicado é "não é cliente OU o grupo está entre os dele", para quem não é CLIENTE manter exatamente a visão anterior sem depender de vínculo nenhum. A atribuição entra pelo formulário de Usuários (checkboxes que aparecem só no nível CLIENTE), gravada com service_role atrás do mesmo portão da 0013. **Efeito colateral que quase passou:** o cache de referências de `coletas-importadas/queries.ts` guardava `sites`/`grupos_sites`/`qr_codes` entre usuários, apoiado no comentário de que as três não tinham recorte — premissa que a 0014 derruba. As três saíram do cache, e o teste que afirmava o contrário foi invertido. pgTAP em `escopo_de_cliente_test.sql` cobre os dois lados e o caso que quebraria calado (quem não é cliente segue vendo tudo) |
| `Usuários` era só leitura — o sistema não admitia ninguém | CRUD completo (`usuarios/actions.ts`, `UsuarioForm.tsx`, `novo/`, `[id]/editar/`), com 24 testes concentrados no portão de permissão. Combinado com a 0008 (conta nova nasce inativa), **ativar um usuário novo só era possível pelo painel do Supabase**. A escrita usa `service_role` porque `cargo` e `ativo` não têm grant para `authenticated` (0002/0007) e **não devem ter** — são as colunas que definem poder. A consequência é que a checagem na action é o único portão: não há RLS atrás dela. Daí a migration 0013 criar `pode_administrar_usuarios()` (só GESTOR, régua mais estreita que `pode_administrar_cadastros()`, que inclui SUPERVISOR e OPERACIONAL — senão quem cadastra site poderia se promover a GESTOR), a checagem rodar com o cliente da sessão antes de qualquer escrita, e o pgTAP `pode_administrar_usuarios_test.sql` cobrir os cinco níveis mais o gestor inativo. Bloqueia ainda desativar a própria conta e alterar o próprio nível — sem isso o único gestor se tranca para fora |
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
