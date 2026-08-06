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
> sistema de referência — **o que ainda não existe**. Os itens de ausência que
> isso levantou entraram todos como alta prioridade, e **fecharam todos nesta
> rodada**: caminho de entrada das coletas, Site / Planta, CRUD de usuários,
> escopo do CLIENTE, QR-Code, Grupo de Usuários e o painel inicial. Por isso
> não há mais seção de alta prioridade — todo item do menu tem tela, e o que
> sobrou é acabamento ou depende de confirmação externa.
>
> **A ressalva que atravessa a rodada inteira:** nada disso rodou contra um
> Postgres de verdade. Não há Docker neste ambiente para `supabase start`,
> então as migrations 0012 a 0017, o `seed.sql`, a rota de importação e os
> seis arquivos pgTAP seguem sem uma única execução. `pnpm test:db` e um
> `curl` contra o ambiente local são o passo que falta antes de confiar em
> qualquer um deles.

## Média prioridade

1. **Filtros de `coletas-importadas` com semântica assumida, não confirmada.**
   "Localização" foi interpretado como presença/ausência de coordenadas na
   leitura (`leituras.latitude`), "Tipo" como `tipos_servico` do site e
   "Checkpoint" como `qr_codes`. Se o sistema de referência (UP Serviços) usa
   esses campos com outro significado, os filtros restringem errado em
   silêncio. Confirmar com quem conhece a tela original antes de considerar a
   página fechada.

2. **Coluna "Ações" vazia em Coletas Importadas.**
   `coletas-importadas/page.tsx:49` empurra `""` em toda linha. Cabeçalho sem
   conteúdo é pior que coluna ausente: promete uma ação que não existe. Ou
   ganha o "ver detalhes" da tela original, ou sai da lista de colunas.

3. **`Eventos`, `ChecklistLab` e `Suporte` no menu, desabilitados.**
   `DashboardSidebar.tsx:63-65` — mantidos visíveis de propósito, para
   preservar a estrutura de navegação do sistema de referência. Não têm tabela
   nem tela. Ficam aqui para não se perderem de vista.

## Baixa prioridade / nice-to-have

4. **`package-lock.json` local.** Está no `.gitignore` e não é rastreado, então
   não é problema de repositório — mas existe na máquina de desenvolvimento e é
   exatamente a divergência npm/pnpm que a auditoria registra como já tendo
   causado dor. **A nota anterior de que não havia `pnpm` neste ambiente estava
   errada**: `npx pnpm@11.18.0` funciona, e foi como o `pnpm-lock.yaml` voltou
   a bater com o `package.json` nesta revisão. Apagar o `package-lock.json`
   local resolveria o resto.

5. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

6. **`console.error` sem destino de observabilidade.** As linhas de
    `lib/supabase/middleware.ts`, `lib/perfil-atual.ts`, `lib/permissoes.ts` e
    das rotas de API agora carregam um id de correlação (`lib/log.ts` — ver
    "Itens fechados"), mas o destino continua sendo só o stdout do servidor.
    Mandar para um serviço (Sentry, Datadog etc.) exige credencial e serviço
    externos que este ambiente não tem. O `TODO` em
    `app/dashboard/error.tsx:13` marca o lugar de plugar isso quando existir.

7. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

8. **A tela de QR-Code não gera a imagem do QR.** Cadastra o código, o site e a finalidade, mas quem precisa da etiqueta ainda gera o QR por fora. Exigiria uma biblioteca de codificação nova, e nenhuma foi adicionada nesta rodada. `TabelaImpressao` já dá o caminho da folha de impressão quando isso entrar.

9. **Leitura sem `area` escapa da deduplicação da importação.** No Postgres,
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
| `/dashboard` não tinha tela própria | Painel com faixa de indicadores (coletas, visitas, cumprimento da meta, cadastros ativos) e o gráfico “Visitas realizadas x meta, por site” — o que a 0004 antecipou ao criar `metas_visitas`, que existia com policy de leitura e **nenhum leitor**. A agregação mora em duas views da migration 0017, ambas `security_invoker = true`: sem isso uma view roda com as permissões de quem a criou e **contorna o RLS inteiro**, e o dashboard reabriria pela porta dos fundos o que a 0014 acabou de fechar. O mês é cortado em -03:00 no SQL e no rótulo, pela mesma razão de `combinarDataHora`. **O gráfico foi olhado renderizado, não só testado** — e foi o mock que pegou um defeito que teste nenhum pegaria: com o preenchimento travado no trilho, um site a 130% de uma meta pequena desenhava barra mais curta que outro a 88% de uma meta grande, contradizendo o rótulo ao lado. Passou a medir trilho e preenchimento na mesma escala absoluta, com a meta marcada por um sulco de 2px na cor da superfície para o alvo não sumir sob o excedente. Cores validadas com o script do skill contra `#0b0b26`, não escolhidas a olho: o verde da marca (#00e676) tem OKLCH L 0.81 e estoura a banda do modo escuro, então o preenchimento usa `#00a651` — passo mais escuro do mesmo ramo — sobre trilho `#10553a` a 2,19:1 |
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
