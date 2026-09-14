# performance-lab-login

Portal operacional da **Up Serviços** — login, cadastros (sites,
grupos de sites, QR-Codes, usuários, grupos de usuários) e inspeção das
coletas importadas de campo.

Next.js 16 (App Router) + Supabase (Postgres, RLS, Auth). Em português.

## Stack

- **Next.js 16** — App Router, Server Actions, Turbopack
- **Supabase** — Postgres, Row Level Security, Auth, PostgREST
- **TypeScript**, **Tailwind CSS 4**
- **pnpm 11.18** como gerenciador de pacotes
- **vitest** (unidade), **pgTAP** (políticas de RLS), **Playwright** (e2e)

## Pré-requisitos

- Node.js compatível com Next 16
- [pnpm](https://pnpm.io) — a versão exata está fixada em `packageManager`
  no `package.json`
- Um projeto Supabase (local via Supabase CLI, ou hospedado)

## Configuração

```bash
pnpm install
cp .env.example .env.local
```

Preencha o `.env.local` com as credenciais do seu projeto Supabase. Cada
variável em `.env.example` já explica onde encontrar o valor e por que ela
existe — em especial:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — obrigatórias,
  o app não builda sem elas (`lib/env.ts`)
- `SUPABASE_SERVICE_ROLE_KEY` / `IMPORTACAO_SECRET` — só necessárias para a
  rota `POST /api/importar/coletas` funcionar; sem elas o resto do app
  continua normal, só essa rota responde 500

Nunca coloque a `service_role` key numa variável `NEXT_PUBLIC_*` — ela ignora
todas as políticas de RLS e qualquer prefixo `NEXT_PUBLIC_*` é embutido no
bundle enviado ao navegador.

## Banco de dados

O schema vive em `supabase/migrations/`, numerado e sequencial (`0001` a
`0023`). Aplique com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

`supabase/seed.sql` popula as tabelas de referência (eventos, ações,
qualificadores, tipos de serviço) e um grupo de sites de exemplo, para a
importação de coletas ter em que se apoiar.

**Um banco sem `seed.sql` não tem como ser populado só pela tela.** `Novo
Grupo de Sites` exige selecionar ao menos um site já cadastrado, e `Novo
Site / Planta` exige selecionar um grupo de sites já cadastrado — em par,
travam um ao outro quando as duas tabelas estão vazias. `seed.sql` contorna
isso inserindo os dois direto via SQL (sem passar pela validação da tela).
Provisionando um ambiente novo sem rodar o seed, cadastre o primeiro grupo e
o primeiro site manualmente via SQL (ou pelo painel do Supabase) antes de
usar as telas.

### Tipos do banco (`database.types.ts`)

`packages/shared/src/database.types.ts` é gerado a partir do banco **local**,
que a CLI monta aplicando `supabase/migrations/` do zero:

```bash
supabase start          # exige Docker
pnpm run types:generate
```

Gerar contra o local (e não contra o projeto hospedado) é o que fecha o ciclo:
a migration nova está no seu branch, então o tipo sai do mesmo schema que o
PR está propondo. Contra o remoto, uma migration ainda não aplicada em
produção simplesmente não aparece, e o arquivo nasce velho.

A CI tem um job (`banco`) que refaz exatamente isso e falha se o
resultado diferir do commitado -- `tsc --noEmit` não cobre esse caso, porque
ele checa o código contra o arquivo, não o arquivo contra o banco. Se o job
acusar, rode o comando acima e commite o resultado; não edite
`database.types.ts` à mão (já divergiu do schema real mais de uma vez neste
projeto -- funções de RLS renomeadas sem o arquivo acompanhar).

Sem Docker à mão, `pnpm run types:generate:remoto` gera pela Management API
do projeto **vinculado** — ele lê o ref de `supabase link`, que fica em
`supabase/.temp/` (fora do versionamento), em vez de trazer o identificador
do projeto cravado num script commitado. Exige `SUPABASE_ACCESS_TOKEN` (de
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens),
não confundir com a `service_role` key). Vale para inspecionar o schema de
produção; para preparar um PR com migration nova, use o local.

## Rodando localmente

```bash
pnpm dev
```

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe o servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build de produção / serve o build |
| `pnpm lint` | ESLint |
| `pnpm test` | Testes unitários (vitest) |
| `pnpm test:db` | Testes de política de RLS (pgTAP, exige `supabase start` local; roda também no job `banco` da CI) |
| `pnpm test:e2e` | Testes ponta-a-ponta (Playwright) |
| `pnpm run types:generate` | Regenera `database.types.ts` a partir do banco local (exige `supabase start`) |
| `pnpm run types:generate:remoto` | Idem, a partir do projeto vinculado (exige `supabase link` + `SUPABASE_ACCESS_TOKEN`) |

Os testes e2e de sessão autenticada pulam sozinhos sem as variáveis
`E2E_EMAIL` / `E2E_PASSWORD` / `E2E_INACTIVE_EMAIL` / `E2E_INACTIVE_PASSWORD`.

## Monitoramento

`GET /api/health` é o sinal de vida do painel, para um monitor externo bater a
cada poucos minutos. Confere duas coisas — o banco responde, e as envs
obrigatórias estão presentes — e devolve **200** de pé, **503** fora. O corpo
é só `{ status, banco, envs }`: a rota é pública (monitor não autentica),
então nome de env e mensagem do Postgres vão para o log do servidor, não para
a resposta.

O que ele pega, e o cron diário de importação não pegava: env perdida num
deploy, projeto Supabase pausado por inatividade, chave rotacionada sem
atualizar o ambiente. Nos três o painel carrega e só quebra quando alguém
tenta usar.

**Falta apontar um monitor para ele** — qualquer serviço de uptime serve,
configurado para alertar em status diferente de 200. E, no Sentry, uma regra
de alerta por taxa de erro: o projeto já emite os eventos (agora dos dois
lados, painel e app de campo) e ninguém é avisado deles.

## App de campo: builds, atualização e erro

O `apps/mobile/eas.json` é JSON e não aceita comentário, então o raciocínio
dos três perfis mora aqui.

| Perfil | Para quê | Distribuição |
|---|---|---|
| `development` | Dev client, com o Metro conectado | interna |
| `preview` | Homologação — APK que a supervisão instala à mão | interna, `apk` |
| `production` | Publicação, com `autoIncrement` do `versionCode` | `app-bundle` |

Cada perfil define `EXPO_PUBLIC_AMBIENTE`, que é o que separa um evento de
homologação de um evento de campo no Sentry.

**Erro do app (Sentry).** Sem `EXPO_PUBLIC_SENTRY_DSN` o app não envia nada e
não falha por isso — é o estado de desenvolvimento. O SDK fica isolado em
`src/lib/observabilidade-sentry.ts`, o único arquivo que o importa; todo o
resto passa por `src/lib/observabilidade.ts`, que não conhece o Sentry. A
separação não é purismo: o SDK arrasta o `react-native`, que é Flow e não
carrega no vitest, e instrumentar `sincronizacao.ts` direto derrubaria o teste
node dele.

**Piso de versão.** O app pergunta a `/api/app/versao-minima` no painel qual a
versão mínima aceita e se recusa a passar do login se estiver abaixo dela —
um build antigo escreve com contrato antigo, e o estrago aparece como dado
incompleto num relatório meses depois, não como erro. O piso é a env
`VERSAO_MINIMA_DO_APP` no painel: subir o número e publicar barra os aparelhos
antigos no próximo login, sem tocar em APK. **Vazio, o portão fica desligado.**
A checagem falha aberta de propósito (sem rede, ninguém é barrado) — o
raciocínio completo está em `apps/mobile/src/lib/versao-minima.ts`.

**Falta ligar a conta do EAS.** O `expo-updates` está instalado e configurado
(`runtimeVersion` por `appVersion`), mas publicar atualização exige rodar
`eas init` dentro de `apps/mobile/` com a conta Expo — é ele que grava
`extra.eas.projectId` e `updates.url` no `app.json`. Enquanto isso não
acontece, o app roda normalmente e apenas não recebe atualização por canal. O
mesmo vale para o upload de source map do Sentry, que pede `organization` e
`project` no plugin.

## Estrutura

Monorepo pnpm. A raiz nao tem codigo de aplicacao -- so a configuracao que
vale para o repositorio inteiro.

```
apps/
  web/                   Painel dos 19 administrativos (Next.js)
    src/app/             App Router — páginas e rotas
      dashboard/cadastros/  5 módulos (sites, grupos de sites, QR-Codes,
                            usuários, grupos de usuários), todos no mesmo
                            formato: page · novo · [id]/editar · actions ·
                            queries · Form · export/excel · export/pdf
      dashboard/inspecoes/  Coletas importadas — listagem, filtros, exportação
      api/                  Rotas de servidor (importação de coletas, webhook)
    src/components/      Componentes de UI — raiz é a tela de login,
                         dashboard/ é o resto
    src/lib/             Sessão, permissões, segurança, formato de dados
    src/proxy.ts         Middleware de sessão (roda em toda rota, exceto API)
    e2e/                 Specs do Playwright
    next.config.ts, vitest.config.mts, playwright.config.ts, vercel.json

  mobile/                App dos 15 inspetores em campo (Expo / React Native)
    src/telas/           Login, Inspeções, Acesso bloqueado
    src/auth/            Sessão e perfil
    src/lib/             Cliente Supabase e envs
    metro.config.js      Resolução do workspace (symlinks do pnpm)

packages/
  shared/                Contratos usados pelos dois apps — a fronteira
    src/campo/           Regras e esquemas Zod de visita/leitura
    src/database.types.ts  Gerado do schema (`pnpm run types:generate`)
    src/cargos.ts        Cargos de profiles, incluindo INSPETOR
    src/supabase-client.ts Cliente com storage injetável

supabase/                Banco — infra dos dois apps, nao de um deles
  migrations/            Schema, uma migration por mudança
  tests/database/        Testes pgTAP das políticas de RLS

.github/workflows/       CI: jobs `build`, `banco` e `e2e` (os tres obrigatorios)
eslint.config.mjs        Lint do monorepo inteiro
pnpm-workspace.yaml      Workspaces e overrides
```

**A direcao das dependencias e regra, nao convencao:** `packages/shared` nao
importa de `apps/` -- ele e consumido pelos dois, entao depender de um deles
inverteria a seta e faria o painel quebrar o app de campo. Os dois apps nao se
importam entre si; o que for comum sobe para `shared`.

## Documentação adicional

- [`docs/auditoria-seguranca.md`](./docs/auditoria-seguranca.md) — levantamento de segurança
- [`docs/melhorias.md`](./docs/melhorias.md) — backlog priorizado
- [`docs/importacao-de-coletas.md`](./docs/importacao-de-coletas.md) — contrato da rota `POST /api/importar/coletas`
