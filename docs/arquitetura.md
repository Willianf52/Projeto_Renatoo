# Arquitetura

Como o sistema é montado de ponta a ponta — painel web, app de campo, banco e
a operação em volta deles — e o padrão a seguir ao mexer em cada parte. Não é
aspiracional: reflete o que está em produção. O que ainda falta está em
"Limites conhecidos", no fim, com data.

Última conferência contra o código: **25/09/2026** (`main` em `3bc6fb3`,
migrations até a 0058).

## Visão geral

```
                 ┌────────────────────────────┐
  navegador ───▶ │ Painel web (apps/web)      │── Resend (e-mail de aviso)
                 │ Next.js 16 · Vercel gru1   │── ViaCEP (via /api/cep)
                 └─────────────┬──────────────┘
                               │ sessão do usuário / service_role (só servidor)
  sistema de origem ──POST────▶│ /api/importar/coletas (segredo compartilhado)
                               ▼
                 ┌────────────────────────────┐
                 │ Supabase · sa-east-1       │  Postgres 17 + RLS
                 │ Auth · Storage · pg_cron   │  pg_net + Vault (webhooks)
                 └─────────────▲──────────────┘
                               │ token da sessão do inspetor (nunca service_role)
                 ┌─────────────┴──────────────┐
  inspetor ────▶ │ App de campo (apps/mobile) │  fila offline em SQLite
                 │ Expo 57 · Android · EAS    │  sessão no Keystore
                 └────────────────────────────┘

  Sentry: painel (javascript-nextjs) e app (app-inspetores)
  GitHub Actions: CI, backup diário para o R2, ensaio mensal de restauração
```

Três peças de código, um banco só. **Quem autoriza é o banco**, não o cliente:
painel e app são duas interfaces sobre as mesmas policies de RLS.

## Monorepo

`pnpm` workspaces, sem Turborepo nem Nx — o `package.json` da raiz só repassa
comandos por `--filter`.

| Pacote | O que é | Roda onde |
|---|---|---|
| `apps/web` | Painel administrativo e relatórios, mais as rotas de API | Vercel |
| `apps/mobile` | App dos inspetores (ronda, checklist, assinatura) | Android, via EAS |
| `packages/shared` (`@projeto-renatoo/shared`) | Tipos do banco, cargos, contrato do formulário de campo (zod), factory do cliente Supabase, tema | importado pelos dois |

**`packages/shared` é a fronteira anti-drift.** Uma regra de campo que vale
para os dois clientes (validação de leitura, lista de cargos, forma do
checklist) entra lá, e não no app que a pediu primeiro. Um valor divergente
entre web e mobile não dá erro de compilação: dá tela vazia de um lado e dado
de mais do outro. O pacote não carrega dependência nativa de React Native — o
armazenamento da sessão entra por parâmetro (`ArmazenamentoDeSessao`).

Cada workspace tem seu `tsconfig` e roda seu próprio `tsc --noEmit` na CI: o do
Expo não inclui `dom`, então um `window` indevido no app falha lá em vez de
passar herdando a config do painel.

## Autorização mora no banco

O RLS é a autorização. O TypeScript só decide o que **mostrar**
(`lib/permissoes.ts` chama as funções do banco por RPC para desabilitar um
botão); quem **permite** é a policy.

- **Funções de autorização no schema `autorizacao`** (0050): `usuario_ativo`,
  `nivel_acesso_atual`, `e_inspetor`, `e_cliente`, `pode_ver_*`,
  `pode_administrar_*`. O PostgREST não expõe esse schema, então elas não são
  chamáveis por `/rest/v1/rpc`. As policies as guardam por OID.
- **Rotinas internas no schema `manutencao`**: expurgo por retenção, validação
  da leitura de campo e o aviso de troca de senha.
- **Grants explícitos por papel** (0038, 0039): o schema é auto-suficiente,
  sem depender do default ACL da plataforma. `anon` não escreve nada;
  `authenticated` só tem o grant que a policy precisa.
- **Conta nova nasce inativa** (0008, 0019), e conta inativa é bloqueio de
  banco, não de tela: `e_inspetor()` é `usuario_ativo() AND nivel = 'INSPETOR'`.
- **Escopo de cliente** (0014): usuário `CLIENTE` só enxerga o grupo de sites
  ao qual está vinculado.
- **Toda mudança sensível deixa trilha** em `auditoria` (0034), gravada por
  trigger `security definer`, não pela aplicação.

### Os quatro caminhos de escrita

| Caminho | Quem usa | Credencial | Exemplo |
|---|---|---|---|
| Server Action com a sessão | painel | cookie do usuário, sob RLS | cadastros, perguntas do checklist |
| `service_role` no servidor | painel | `lib/supabase/admin.ts`, `server-only` | criar conta, `/api/importar/coletas`, `/api/health` |
| INSERT direto pelo token do inspetor | app | JWT do inspetor, sob RLS | `visitas`, `leituras` (0036, 0054) |
| RPC `security definer` com contrato | app | JWT do inspetor | `registrar_checklist` (0042) |

A `service_role` nunca entra em cliente: nem no bundle do navegador (o
`import "server-only"` quebra o build) nem no APK, de onde seria extraível.
Nenhum arquivo `"use client"` importa `@/lib/supabase/server` ou
`@/lib/supabase/admin` — conferido por grep em 25/09.

O inspetor tem **só INSERT** em `visitas`/`leituras`: sem grant de UPDATE nem
de DELETE, o que recusa por permissão antes mesmo do RLS. Leitura enviada não
se edita pelo app, por decisão de produto.

Para escrever policy nova, ver a skill `supabase-rls-security` e os pgTAP em
`supabase/tests/database/`.

## Fluxos que atravessam o sistema

### Ronda de campo, offline por padrão

1. O inspetor lê o QR. O app grava a visita e a leitura em **SQLite**
   (`apps/mobile/src/campo/fila.ts`) — sobrevive ao app morto pelo sistema no
   meio da ronda. Migração do schema local por `PRAGMA user_version`, nunca
   trocando de arquivo.
2. `numero_coleta` é um **UUID cunhado no aparelho** na primeira leitura
   (0047), chave de idempotência junto com `site_id`.
3. Com rede, `sincronizacao.ts` drena a fila **do inspetor logado** (o RLS
   exige `funcionario_id = auth.uid()`). O reenvio é `INSERT ... ON CONFLICT DO
   NOTHING` (`ignoreDuplicates`) seguido de `select` para recuperar o id — não
   `upsert`, porque o ramo de UPDATE exigiria uma policy que não existe.
4. Dois relógios: `data_hora` é o do aparelho no scan; `criado_em` é o do
   Postgres na chegada. A diferença denuncia aparelho com hora errada.
5. O trigger `manutencao.validar_leitura_de_campo` (0054) confere a leitura no
   banco antes de aceitá-la.

### Checklist com foto e assinatura

A mídia sobe **antes** das linhas para o bucket privado `checklists`, porque
`assinatura_path` é `not null`. As três tabelas (checklist, fotos, respostas)
entram numa chamada só, pelo RPC `registrar_checklist`. Arquivo órfão no bucket
quando o insert falha é aceito: é lixo, não dado errado. O painel lê a mídia
por URL assinada.

### Importação do sistema de origem

`POST /api/importar/coletas`, autenticado por `x-importacao-secret` comparado
em tempo constante. Escreve com `service_role` e registra **toda tentativa**
em `importacoes` (0033), inclusive as recusadas. O cron diário da Vercel
(`/api/cron/verificar-importacoes`, 12:00 UTC) alerta quando a integração
fica em silêncio. Contrato completo em `docs/importacao-de-coletas.md`.

### Aviso de troca de senha

Trigger `manutencao.avisar_troca_de_senha` em `auth.users` → `pg_net`, com URL
e segredo lidos do **Vault** → `POST /api/webhooks/user-updated` → e-mail pela
Resend. Os destinatários são `array[new.email, old.email]` sem repetição: numa
troca de e-mail e senha no mesmo `UPDATE`, o dono antigo também é avisado
(0053). O corpo não carrega hash nem credencial. Sem Vault ou `pg_net`, o
trigger avisa e **não falha** a troca de senha.

### Relatórios

Agregação **no banco**, por funções `relatorio_*` (0049, 0055–0057), e não em
TypeScript: o painel recebe as linhas já somadas, em vez de baixar a operação
inteira para agrupar em memória. A regra de negócio de cada relatório mora
junto do SQL e tem pgTAP próprio.

## Painel web (`apps/web`)

### Feature-first via colocation de rota

O App Router já é um índice de features: cada pasta sob
`apps/web/src/app/dashboard/<área>/<feature>/` contém tudo que aquela feature
precisa, junto da rota — em vez de espalhado por um `src/features/` paralelo.
É o padrão "Split project files by feature or route" da documentação do Next
(`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`).

| Área | Features |
|---|---|
| `cadastros/` | `usuarios`, `grupo-de-usuarios`, `grupo-de-sites`, `site-planta`, `qr-code`, `trocar-senha` |
| `checklistlab/` | `perguntas`, `historico-de-checklist` |
| `inspecoes/` | `coletas-importadas` e `relatorios/*` (6 relatórios) |
| `eventos/relatorios/` | 7 relatórios, 2 deles ainda sem a migration da não conformidade |

A forma de uma feature de cadastro:

```
dashboard/cadastros/usuarios/
  page.tsx                 # Server Component — monta a tela, chama queries.ts
  actions.ts               # "use server" — toda mutação passa por aqui
  queries.ts               # leitura, roda no server (createClient() lê cookies)
  UsuarioForm.tsx          # "use client" só aqui — precisa de useState/eventos
  constantes.ts
  actions.test.ts
  queries.test.ts
  novo/page.tsx
  [id]/editar/page.tsx
  export/{excel,pdf}/      # route handlers de exportação
```

**Ao adicionar uma feature nova, comece copiando a forma de uma dessas — não
um `src/features/` novo.** Os detalhes de formulário, filtro e exportação estão
na skill `nextjs-architecture-patterns`.

### Onde vive código compartilhado

| Pasta | Conteúdo | Exemplos |
|---|---|---|
| `apps/web/src/components/` | UI genérica, sem saber de domínio | `Button`, `Toast`, `FormField`, `Spinner`, `HeroPanel` |
| `apps/web/src/components/dashboard/` | UI compartilhada *entre* features do painel | `DataTable`, `Filter*Picker`, `GraficoDePizza`, `DashboardSidebar` |
| `apps/web/src/lib/` | Lógica de negócio e infra, sem JSX | `supabase/`, `permissoes.ts`, `limite-compartilhado.ts`, `relatorios.ts` |
| `packages/shared/` | O que o app de campo também usa | cargos, esquemas de campo, tipos do banco |

Regra prática: se um componente aparece em mais de uma feature, sobe para
`components/dashboard/`. Se nasceu numa feature e só ela usa, fica na pasta da
feature. Se o app de campo também precisa, vai para `packages/shared`.

### Server Components, Client Components e Server Actions

- **Padrão é Server Component.** `"use client"` só entra quando o arquivo usa
  `useState`/`useEffect`/`useRef` ou responde a evento de navegador — são 30
  arquivos client hoje.
- **Mutação sempre por Server Action** em `actions.ts` com `"use server"` no
  topo — nunca `fetch` direto do client para o Supabase em escrita. A única
  escrita que sai do navegador é a telemetria de uso (abaixo), por desenho.
- **`cacheComponents: true`** no `next.config.ts`. As páginas de impressão
  declaram `instant = false`.
- **`proxy.ts`** (o antigo `middleware.ts`, renomeado no Next 16, roda em
  `nodejs`) renova a sessão e barra rota privada sem login. Não roda em
  `/api/*` — cada rota de API se autentica sozinha — nem em `/monitoring`, o
  túnel do Sentry.

### Rotas de API

| Rota | Autenticação | Limite |
|---|---|---|
| `/api/importar/coletas` | `x-importacao-secret` | por chamador |
| `/api/webhooks/user-updated` | `SUPABASE_WEBHOOK_SECRET` | por chamador |
| `/api/cron/verificar-importacoes` | `Authorization: Bearer <CRON_SECRET>` | por chamador |
| `/api/senha/verificar-vazamento` | sessão | por chamador |
| `/api/cep` | sessão | 30/min |
| `/api/health` | pública | 60/min |
| `/api/app/versao-minima` | pública | 60/min |

**Limite de taxa compartilhado** (0048): o contador mora no Postgres
(`consumir_limite_de_taxa`, atômico), então vale entre todas as instâncias
serverless. A chave vai com sha256 — o banco não guarda IP em claro. Com o
banco fora, cai para um `Map` por instância: limite frouxo, mas limite.

### Cabeçalhos e CSP

Um lugar só emite cabeçalho de segurança: `headers()` no `next.config.ts`, a
partir de `lib/security-headers.ts`, casando todas as rotas. A CSP está
aplicada (não Report-Only), com `connect-src` restrito à própria origem e ao
Supabase — por isso o Sentry passa pelo túnel `/monitoring` e o ViaCEP por
`/api/cep`. `script-src` mantém `'unsafe-inline'`: nonce foi tentado e
revertido porque exigiria tornar dinâmicas as páginas prerenderizadas (o motivo
está no arquivo).

### Região das funções na Vercel

`apps/web/vercel.json` fixa `"regions": ["gru1"]` (São Paulo). O banco está em
`sa-east-1`, também em São Paulo, e o padrão da Vercel sem essa chave é `iad1`
(Washington). Medido em 16/09/2026 pelo cabeçalho `X-Vercel-Id`: a borda
atendia em `gru1`, mas a função executava em `iad1` (`gru1::iad1::…`) — toda
consulta ao Supabase ia aos EUA e voltava, e cada navegação no painel faz pelo
menos duas antes de desenhar a tela (`getUser()` e `profiles` no `proxy.ts`).
`/api/health` sozinho levava de 0,76 a 2,3 s.

Se o banco mudar de região, esta chave muda junto. Conferir depois de um
deploy: `curl -sI <url>/api/health | grep -i x-vercel-id` deve mostrar `gru1`
nos dois segmentos.

## App de campo (`apps/mobile`)

Expo SDK 57, React Native 0.86, React Navigation. Só Android: `app.json` não
tem `ios.bundleIdentifier` e `eas.json` só tem perfil Android. **Não roda no
Expo Go** — os config plugins do Sentry, SecureStore, SQLite e image picker
exigem dev build.

- **Sessão no Keystore**, não no AsyncStorage (`lib/armazenamento-seguro.ts`).
  A sessão do Supabase já nasce com mais de 2048 bytes, o teto do SecureStore
  no Android, então ela é gravada em pedaços com um manifesto.
- **Ciclo de vida da sessão** (`auth/ciclo-de-vida.ts`): o refresh de token
  liga e desliga com o `AppState`, e o perfil é revalidado ao voltar para o
  primeiro plano, com no máximo uma consulta a cada 30 s. Uma desativação feita
  no painel aparece na próxima vez que o inspetor pegar o aparelho.
- **Piso de versão vindo do servidor** (`lib/versao-minima.ts` →
  `/api/app/versao-minima`), e não de uma env do bundle, que o aparelho velho
  carregaria junto. **Falha aberta:** sem rede ou com o painel fora, o app
  segue — o portão não pode parar a ronda.
- **Observabilidade por porta e adaptador** (`lib/observabilidade.ts` e
  `observabilidade-sentry.ts`): a lógica de campo testável em Node não importa o
  SDK do Sentry.
- **Lógica fora do componente.** `fila.ts`, `sincronizacao.ts`,
  `envio-de-checklist.ts` e `ciclo-de-vida.ts` são funções puras ou quase,
  cobertas pelo Vitest com `environment: node`. As telas são casca fina.

### Build e distribuição

| Perfil EAS | Saída | `EXPO_PUBLIC_AMBIENTE` | Uso |
|---|---|---|---|
| `development` | dev client | `desenvolvimento` | emulador + Metro |
| `preview` | APK, distribuição interna | `homologacao` | piloto; aponta para o Supabase de produção |
| `production` | AAB, `autoIncrement` | `producao` | Play Store |

`appVersionSource: remote`: o `versionCode` é do EAS, não do `app.json`. As
variáveis do app e o `SENTRY_AUTH_TOKEN` estão no EAS, nos perfis `preview` e
`production` — o `.env` local não vai para o build na nuvem. O build na nuvem
precisa de `EAS_SKIP_AUTO_FINGERPRINT=1`, e o build Android local precisa do
virtual store do pnpm num caminho curto (`virtualStoreDir`, edição local
proibida de commitar — há um portão na CI para isso).

## Tipagem integrada com o Supabase

`packages/shared/src/database.types.ts` é gerado a partir do schema e alimenta
o generic `Database` em todos os clientes:

- `apps/web/src/lib/supabase/server.ts` — `createServerClient<Database>(...)`
- `apps/web/src/lib/supabase/client.ts` — `createBrowserClient<Database>(...)`
- `apps/web/src/lib/supabase/admin.ts` — `createClient<Database>(...)`
- `packages/shared/src/supabase-client.ts` — o do app de campo

**Para regenerar** depois de uma migration nova:

```
supabase start            # aplica supabase/migrations/ num Postgres local
pnpm run types:generate   # gen types --local > database.types.ts
```

Contra o **local**, de propósito: é o único schema que já contém a migration
do branch atual. O job `banco` da CI repete o comando e falha se o arquivo
commitado divergir. `pnpm run types:generate:remoto` gera pelo projeto
hospedado e reflete o que já está em produção, não o que o PR propõe — e por
isso produz um arquivo que a CI pode recusar.

### Por que `aplicarFiltros`/`aplicarFiltrosDeColeta` continuam com `query: any`

Três funções (`coletas-importadas/queries.ts`, `qr-code/queries.ts`,
`site-planta/queries.ts`) recebem um builder do PostgREST já criado e
re-encadeiam `.eq()`/`.gte()`/`.lte()` condicionalmente. O generic `Database`
tipa o que `.from()` devolve, mas não resolve reencadear um builder já tipado
sem repetir cada método na assinatura da função — por isso continuam `any`, de
propósito, com o motivo documentado em cada uma. É uma troca já avaliada.

## Migrations e banco

- **Numeração `NNNN_` dentro do nome, carimbo de data na frente** a partir da
  0028. A ordem de aplicação é a do carimbo, não a do número: a 0053 e a 0054
  foram aplicadas depois da 0057, e os arquivos foram renomeados para bater com
  a versão registrada em produção.
- **O schema é auto-suficiente**: `supabase start` num banco vazio chega ao
  mesmo estado de produção, grants inclusive (0038). O `seed.sql` liga `vault`
  e `pg_net` no stack local e traz os dados de que o e2e depende.
- **Agendamentos no `pg_cron`**: expurgo de `eventos_de_uso` com mais de 12
  meses, diário às 06:30 UTC (0052). A retenção de cada tabela está em
  `docs/lgpd-privacidade.md`.
- **Storage**: bucket privado `checklists`, com o caminho amarrado à visita
  (0045) e tipo e tamanho validados no banco (0046).

## Observabilidade

| Sinal | Painel | App |
|---|---|---|
| Erros | Sentry `javascript-nextjs`, túnel `/monitoring`, sem corpo, cookie nem dado de usuário (`lib/sentry-privacidade.ts`) | Sentry `app-inspetores`, source maps enviados no build do EAS |
| Log | `lib/log.ts`: id de correlação por requisição, stdout da Vercel e Sentry | — |
| Uso | `eventos_de_uso` (0051): login e tela aberta, com autor preenchido por trigger | — |
| Saúde | `/api/health` (consulta o banco) | — |
| Integração | `importacoes` + alerta de silêncio pelo cron | — |

As consultas diárias de acompanhamento do piloto estão em
`docs/piloto-de-operacao.md`.

## Entrega

### CI (`.github/workflows/ci.yml`)

Quatro jobs em paralelo, **todos obrigatórios** na proteção da `main`, que
também exige a branch em dia com a `main` (`strict`):

| Job | O que garante |
|---|---|
| `build` | nenhum segredo nem `virtualStoreDir` versionado, `pnpm audit` (high), lint, `tsc` nos três workspaces, Vitest com piso de cobertura por pacote, `next build` |
| `banco` | `database.types.ts` em dia com as migrations; pgTAP das policies de RLS |
| `e2e` | Playwright contra um Supabase local (nunca contra produção), fluxos de login e de negócio |
| `desempenho` | orçamento de bundle, requisições e CLS no build de produção, mais teste de carga |

As actions são fixadas por SHA de commit. Merge na `main` publica produção na
Vercel. Migration **não** é aplicada pela CI: entra em produção por
`supabase db push`/MCP, em passo manual e conferido.

### Dependências

Dependabot semanal: patch e minor agrupados num PR só (a fila travava com um
PR por pacote e `strict` ligado), `vitest` e `@vitest/*` juntos, espera mínima
de 3 dias (7 para major) por causa do `minimumReleaseAge` do pnpm 11. Patch e
minor entram por auto-merge depois da CI. Pacotes do SDK do Expo sobem junto
com o SDK, nunca soltos. Vulnerabilidade transitiva sem correção a montante
vira `overrides` no `pnpm-workspace.yaml`, com o motivo escrito.

### Backup e restauração

Dois workflows, detalhados em `docs/backup-e-restauracao.md`:

- **Backup do banco**, diário às 09:00 UTC: `pg_dump` cifrado com GPG
  (`BACKUP_CHAVE`) e enviado ao Cloudflare R2, com contagem de linhas para
  conferência.
- **Ensaio de restauração**, mensal: tira um dump de produção, restaura num
  Supabase descartável dentro do runner (cronometrado — é o RTO medido),
  compara a contagem de linhas de cada tabela e confere que o backup mais
  recente do R2 decripta e está inteiro. Em PR que mexe em
  `supabase/migrations/`, aplica as migrations novas por cima do dado real: é
  o ensaio de migration que substitui um ambiente de staging. O dump nunca
  vira artifact, porque o repositório é público.

Sem os secrets, os dois se pulam e o job aparece como *skipped*, com aviso
dizendo que não existe cópia (#115). O sinal de que funcionaram é a
**duração** — minutos, não segundos —, não a cor do run.

## Limites conhecidos (25/09/2026)

Estado real, não plano. Cada item diz o que falta para sair daqui.

- **Não existe backup ainda.** Os workflows estão prontos e nunca executaram:
  faltam 4 dos 6 secrets (os 3 do R2 e `PRODUCAO_DB_URL`). O Supabase está no
  plano free, sem backup automático nem PITR.
- **Não existe geofence.** `sites` tem latitude, longitude e `raio_metros`,
  mas nada compara a posição da leitura com o raio. Leitura fora do lugar não
  é recusada nem marcada.
- **Sem atualização OTA.** `expo-updates` está instalado e os perfis do EAS
  têm `channel`, mas o `app.json` não tem `updates.url`: toda correção no app
  exige um APK novo instalado à mão em cada aparelho.
- **App nunca rodou em aparelho físico.** Keystore real, refresh em segundo
  plano e fila offline foram provados só no emulador.
- **Remetente de e-mail provisório.** Sem domínio verificado na Resend, o
  aviso de troca de senha sai de `onboarding@resend.dev` e só chega ao dono da
  conta Resend.
- **Não conformidade sem ciclo de vida.** Os relatórios de ranking e de tempo
  médio de resolução esperam a migration de status/resolução.
- **Região única.** Painel e banco estão só em São Paulo; não há réplica nem
  failover. É coerente com o porte atual, e está registrado para não ser
  descoberto num incidente.
