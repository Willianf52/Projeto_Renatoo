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
| `pnpm test:db` | Testes de política de RLS (pgTAP, exige `supabase start` local) |
| `pnpm test:e2e` | Testes ponta-a-ponta (Playwright) |

Os testes e2e de sessão autenticada pulam sozinhos sem as variáveis
`E2E_EMAIL` / `E2E_PASSWORD` / `E2E_INACTIVE_EMAIL` / `E2E_INACTIVE_PASSWORD`.

## Estrutura

```
src/
  app/                   App Router — páginas e rotas
    dashboard/cadastros/ 5 módulos (sites, grupos de sites, QR-Codes,
                         usuários, grupos de usuários), todos no mesmo
                         formato: page · novo · [id]/editar · actions ·
                         queries · Form · export/excel · export/pdf
    dashboard/inspecoes/ Coletas importadas — listagem, filtros, exportação
    api/                 Rotas de servidor (importação de coletas, webhook)
  components/            Componentes de UI — raiz é a tela de login,
                         dashboard/ é o resto
  lib/                   Sessão, permissões, segurança, formato de dados
  proxy.ts               Middleware de sessão (roda em toda rota, exceto API)
supabase/
  migrations/            Schema, uma migration por mudança
  tests/database/        Testes pgTAP das políticas de RLS
docs/                    Documentação de contratos (ex.: importação de coletas)
```

## Documentação adicional

- [`docs/auditoria-seguranca.md`](./docs/auditoria-seguranca.md) — levantamento de segurança
- [`docs/melhorias.md`](./docs/melhorias.md) — backlog priorizado
- [`docs/importacao-de-coletas.md`](./docs/importacao-de-coletas.md) — contrato da rota `POST /api/importar/coletas`
