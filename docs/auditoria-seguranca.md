# Auditoria de Segurança — Projeto_Renatoo

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript + Supabase (Postgres/Auth/RLS)
**Escopo:** código-fonte completo, histórico do git, dependências (`npm audit`), `.gitignore`, e configuração do repositório GitHub (esta última só com recomendações — não há `gh` CLI autenticado neste ambiente para inspecionar as configurações reais em github.com/Willianf52/Projeto_Renatoo, então valide manualmente).

---

## 1. Gestão de Segredos e Credenciais

**Resultado geral: limpo.** Não encontrei segredo hardcoded no código-fonte.

- Busquei por `api_key`, `secret`, `password =`, `service_role`, `token =`, blocos `BEGIN PRIVATE KEY` em todo `.ts`/`.tsx`/`.sql`/`.json` (fora `node_modules`). Os únicos hits foram nomes de variável (`password`) e comentários explicando que a promoção de cargo e a importação de lotes só acontecem "via painel, SQL ou service_role" — ou seja, o código documenta a intenção de nunca usar a `service_role` key a partir do navegador, e de fato ela não aparece em lugar nenhum do app.
- `git log --all --full-history -- .env .env.local .env.production` retornou vazio, e `git ls-files | grep env` só lista `.env.example`. Nenhum arquivo de env jamais foi commitado, em nenhum branch.
- `.gitignore` está correto: `.env*` seguido de `!.env.example`, e cobre `*.pem` também.
- O único valor de Supabase que o cliente usa é `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`) — que por definição é uma chave pública, protegida pelo RLS, não uma credencial secreta. Correto.

**Pontos de atenção (não são vazamento, são hardening):**

- `lib/supabase/client.ts:5`, `server.ts:8`, `middleware.ts:16-17` usam `process.env.X!` (non-null assertion). Se a env faltar, o erro só aparece fundo no SDK do Supabase, sem dizer qual variável está ausente — já vivemos isso nesta sessão. Ver correção na seção 4.
- Um `package-lock.json` foi gerado localmente (ao instalar o vitest) mas está coberto pelo `.gitignore` (`/package-lock.json`, com o comentário de que o projeto usa pnpm oficialmente) — não vaza nada, é só ruído local. Vale rodar `pnpm install` para manter só `pnpm-lock.yaml` como fonte de verdade antes de configurar CI (ver seção 3).

## 2. Vulnerabilidades de Código (OWASP Top 10)

| Categoria OWASP | Resultado | Evidência |
|---|---|---|
| A03 Injeção (SQL/NoSQL) | **Não encontrada.** Todo acesso a dados passa pelo query builder do Supabase (`.eq()`, `.in()`, `.select()`), que parametriza no PostgREST. Não há `.rpc()` com SQL cru nem concatenação de string em query. Busquei especificamente por isso e não achei nenhum caso. | `app/dashboard/inspecoes/coletas-importadas/queries.ts` |
| A03 XSS | **Não encontrada.** Zero uso de `dangerouslySetInnerHTML`, `eval`, `innerHTML` em todo o projeto. O React escapa por padrão o que é renderizado (nomes, observações, etc. em `DataTable`). | busca em todo `.tsx` |
| A05 Configuração incorreta — **faltam headers de segurança** | `next.config.ts` está vazio: nenhum `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` ou `Permissions-Policy` configurado. Não é uma falha ativa, mas é a lacuna mais concreta e barata de fechar aqui — defesa em profundidade contra clickjacking e XSS residual. | `next.config.ts:1-5` |
| A06 Componentes vulneráveis/desatualizados | **3 vulnerabilidades altas** via `npm audit`, ambas transitivas dentro do próprio `next`: `postcss@8.4.31` (embutido em `node_modules/next/node_modules/postcss`) com CVE de path traversal/leitura arbitrária de arquivo via `sourceMappingURL` (CVSS 7.5), e `sharp@0.34.5` com CVEs em `libvips` (CVE-2026-33327/33328/35590/35591). `sharp` é alcançável de verdade: `next/image` é usado em `components/HeroPanel.tsx`, então não é teórico. | `npm audit`, `components/HeroPanel.tsx` |
| A07 Falhas de autenticação | RLS bem desenhado (bloqueia por `usuario_ativo()`, escopo por `cargo`), redirect pós-login validado por `safeRedirectPath` (agora com teste automatizado). ~~**Gap:** a troca de senha não pede mais a senha atual.~~ Corrigido — `trocar-senha/page.tsx` reautentica com `signInWithPassword` contra a senha atual antes de chamar `updateUser`; falhando a reautenticação, a troca nem é tentada. ~~**Gap:** login não dá nenhum feedback de limitação de tentativas.~~ Corrigido — bloqueio de 30s após 5 tentativas em `components/LoginForm.tsx`. | `components/LoginForm.tsx` (era `LoginPage.tsx`), `cadastros/trocar-senha/page.tsx` |
| A08 Falhas de integridade de dados | CSRF: hoje só existe `<form method="get">` no filtro de `coletas-importadas` (não muda estado). Sem risco de CSRF ativo. **Atenção futura:** quando qualquer mutação via POST/Server Action for adicionada (ex.: exportar, editar cadastro), validar origem — Server Actions do Next já checam o header `Origin`, mas uma Route Handler tradicional com POST não tem essa proteção de graça. | n/a hoje, ficar de olho |
| Validação de entrada | Os filtros de `coletas-importadas` (`queries.ts`) recebem strings cruas da query string e passam direto para `.eq()`/`.in()`. Não é injeção (PostgREST tipa e rejeita valor incompatível com erro controlado), mas não há validação de formato antes de bater no banco — hoje só o `pagina` tem fallback numérico. Risco baixo, mas é o tipo de andaime que ajuda a evitar erros silenciosos conforme a tela cresce. | `queries.ts` |

## 3. Segurança do GitHub e Repositório

Não consigo inspecionar as configurações reais do repositório a partir daqui (sem `gh` autenticado). O repositório é `github.com/Willianf52/Projeto_Renatoo`, branch atual `cursor/login-page-performance-lab`. Recomendações para você conferir/aplicar em Settings:

**Branch protection (Settings → Branches):**
- Exigir Pull Request antes de merge na branch principal, com pelo menos 1 review.
- Exigir que os checks de CI passem antes do merge (depois de configurar o workflow abaixo).
- Bloquear force-push e deleção da branch principal.
- Considerar `CODEOWNERS` exigindo review extra em `supabase/migrations/**`, `middleware.ts` e `lib/supabase/**` — são exatamente os arquivos onde o histórico deste repo já mostra duas correções de escalada de privilégio (`migrations 0002` e `0005`). Onde já doeu antes é onde vale mais um segundo par de olhos.

**Dependências:**
- Ativar Dependabot security updates (Settings → Code security) — hoje as 3 vulnerabilidades altas encontradas nesta auditoria não seriam pegas automaticamente por nada no repo.
- Ativar Dependabot version updates com um `.github/dependabot.yml` (modelo na seção 4).
- Ativar Secret Scanning + Push Protection (gratuito em repositórios GitHub, inclusive privados em muitos planos) — rede de segurança extra mesmo o projeto estando limpo hoje.

**Acesso:**
- ~~Confirmar se o repositório é público ou privado intencionalmente — não tenho como verificar daqui.~~ **Respondido em 2026-08-19: é público.** Deixa de ser pergunta aberta e vira achado — ver 5.1.
- Revisar quem tem acesso de `write`/`admin` e se realmente precisa.

**GitHub Actions (quando for configurar CI/CD — hoje não existe `.github/workflows`):**
- Nunca colar valores reais em YAML — sempre `${{ secrets.NOME }}`, configurados em Settings → Secrets and variables → Actions.
- Fixar actions de terceiros por **commit SHA completo**, não por tag mutável (`actions/checkout@<sha>`, não `@v4`) — tags podem ser reescritas por quem comprometer a conta do mantenedor da action.
- Definir `permissions: contents: read` no topo do workflow por padrão, e só elevar (`write`) no job específico que precisa.
- Cuidado com `pull_request_target` combinado com checkout do código do PR: isso roda com acesso aos secrets do repo mesmo vindo de um fork não confiável — é o vetor clássico de exfiltração de secrets em Actions. Prefira `pull_request` normal para PRs externos.
- Nunca colocar uma eventual `SUPABASE_SERVICE_ROLE_KEY` em um job que roda em `pull_request` de fork. Só em `push`/`workflow_dispatch` de branch confiável, idealmente atrás de um Environment com approval manual.
- `npm ci` em vez de `npm install` no CI, para instalar exatamente o que está no lockfile. Antes disso, resolver a ambiguidade pnpm/npm mencionada na seção 1 — CI precisa de um gerenciador único e determinístico.

## 4. Recomendações e Correções (com código)

### 4.1 Headers de segurança ausentes (A05)

**Risco:** sem `X-Frame-Options`/CSP, a aplicação pode ser embutida num `<iframe>` malicioso (clickjacking) e não há camada extra contra XSS caso algum sink apareça no futuro.

> **Corrigido — o snippet abaixo é o registro da proposta original, não o código atual.**
> A implementação vive em `lib/security-headers.ts` e diverge dele em dois pontos que importam:
>
> - **`connect-src` não usa `https://*.supabase.co`.** O curinga autoriza *qualquer* projeto Supabase, e criar um é gratuito — um script hostil exfiltraria sessão e coletas para o projeto do atacante sem violar a política. A origem é derivada de `NEXT_PUBLIC_SUPABASE_URL`. Não copie o curinga daqui.
> - **`script-src` precisou de `'unsafe-inline'`.** A abordagem por nonce foi tentada e revertida; o arquivo registra o porquê.
>
> Consulte `lib/security-headers.ts` antes de mexer em qualquer coisa desta seção.

```ts
// next.config.ts
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

> A CSP acima é um ponto de partida — teste em modo `Content-Security-Policy-Report-Only` primeiro, porque Tailwind/Next em dev injetam estilo/script inline e podem exigir ajuste antes de aplicar em modo bloqueante.
>
> **Etapa já cumprida.** O período de observação em `Report-Only` aconteceu, os ajustes que ele revelou estão em `lib/security-headers.ts`, e a política é bloqueante desde o commit `9c56fd4`.

### 4.2 Dependências vulneráveis (A06)

**Risco:** leitura arbitrária de arquivo via `postcss` (CVSS 7.5) e vulnerabilidades de `libvips` herdadas pelo `sharp`, usado de verdade via `next/image` em `HeroPanel.tsx`.

```json
// package.json — força a versão corrigida mesmo dentro de dependências transitivas do next
{
  "overrides": {
    "postcss": "^8.5.18",
    "sharp": "^0.35.0"
  }
}
```

Depois: `npm install && npm audit` para confirmar que zerou.

### 4.3 Variáveis de ambiente sem validação clara

**Risco:** erro genérico e difícil de diagnosticar quando falta uma env (já aconteceu nesta sessão).

```ts
// lib/env.ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env.local e preencha.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};
```

Substitui `process.env.NEXT_PUBLIC_SUPABASE_URL!` por `env.supabaseUrl` nos três arquivos (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`).

### 4.4 Dependabot

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 4.5 Workflow de CI mínimo e seguro

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin-para-sha-completo>
      - uses: actions/setup-node@<pin-para-sha-completo>
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

Mesmo sendo valores `NEXT_PUBLIC_*` (públicos por natureza), guardá-los como Actions secrets evita cravar a URL/chave real do projeto em YAML versionado e permite trocar por ambiente (staging/produção) sem editar o workflow.

---

## 5. Achados abertos (auditoria de 2026-08-19)

Rodada pedida com foco em operação, não em código: o que acontece quando o
sistema entrar em uso. Diferente das anteriores, esta consultou **o ambiente**
— grants e contagens do banco de produção via SQL direto, advisors do Supabase,
metadados de deploy da Vercel e o histórico de push — em vez de só o
código-fonte. Nenhum achado é exploração ativa; todos são governança ou
premissa vencida. A parte não-segurança da mesma rodada está em
`docs/melhorias.md` (Alta prioridade, revisão de 2026-08-19).

### 5.1 O repositório é público (Alto)

Confirmado em 2026-08-19 pelos metadados de deploy da Vercel
(`githubRepoVisibility: "public"`), respondendo a pergunta que a seção 3
carregava em aberto desde a primeira auditoria.

Reconfirmei antes de classificar que **nenhum segredo está versionado**: o
`.gitignore` cobre `.env*` com `!.env.example`, `git ls-files | grep env` só
devolve `.env.example`/`lib/env.ts`/`scripts/check-env.mjs`, e a busca no
histórico não achou chave. O achado não é vazamento — é superfície.

O que está aberto para leitura: o modelo de autorização inteiro (quais cargos
podem o quê, em qual função `security definer`), o schema completo, todas as
policies de RLS, e o desenho das duas rotas autenticadas por segredo
compartilhado — incluindo o nome exato do header (`x-importacao-secret`), os
limites de taxa aplicados a cada uma e o formato do lote. Nada disso é segredo
criptográfico, e um sistema bem desenhado não deve depender de obscuridade;
mas para uma empresa de padrão corporativo, um sistema que guardará dados
operacionais de clientes não tem por que publicar o próprio mapa. Tornar
privado é uma troca de configuração, sem custo técnico.

### 5.2 Produção sai de branch de trabalho, e o check obrigatório é contornável (Médio)

Os deploys de produção na Vercel apontam para
`cursor/login-page-performance-lab`, que é o `default_branch` real do
repositório; `main` existe e ficou para trás. Não há branch de release, tag de
versão nem changelog — não existe "a versão que está em produção" identificável,
e um rollback depende de achar o deploy certo na lista.

A recomendação de branch protection da seção 3 **foi aplicada** e a regra
existe: o push de 2026-08-19 (`f29801e`, revisão do `melhorias.md`) respondeu
com `Bypassed rule violations ... Required status check "build" is expected`.
Ou seja — a proteção está ligada, o check é exigido, e a conta que empurra tem
permissão para passar por cima. O CI ainda roda depois do fato (o workflow tem
gatilho de `push` para esta branch, justamente por isso), mas depois do fato: o
código já está na branch da qual produção sai quando o build começa.

Fechar exige duas coisas na UI do GitHub, ambas fora do alcance de qualquer
ferramenta daqui: marcar "Do not allow bypassing the above settings" na regra,
e decidir se pushes diretos continuam sendo o fluxo — se continuarem, a regra
de PR obrigatório está sendo mantida por engano, e vale desligá-la em vez de
contorná-la a cada push.

### 5.3 Sessão sem expiração por inatividade e MFA desligado (Médio)

`supabase/config.toml:271-272` tem o bloco `[auth.sessions]` inteiro comentado:
sem `inactivity_timeout` e sem `timebox`. Com `enable_refresh_token_rotation`
ligado e `jwt_expiry = 3600`, uma sessão aberta se renova indefinidamente — em
máquina compartilhada, ela não fecha sozinha nunca. O bloco `[auth.mfa]` existe
com os valores padrão, sem TOTP habilitado.

Para os 19 usuários administrativos, e sobretudo para o cargo GESTOR — que
`pode_administrar_usuarios()` (migration 0013) autoriza a conceder nível de
acesso a terceiros, escrevendo com `service_role` sem RLS atrás —, expiração
por inatividade e TOTP obrigatório são o padrão que uma auditoria externa
espera encontrar.

**Ressalva de escopo, para não ser lido como mais do que é:** verifiquei o
`config.toml`, que governa o ambiente local. As configurações de Auth que valem
em produção moram no painel do projeto hospedado e **não** foram inspecionadas
nesta rodada — pode ser que já divirjam do arquivo, para melhor ou para pior.
Confirmar em Authentication → Sessions e Authentication → Multi-Factor antes de
tratar como pendência ou como resolvido.

### 5.4 O comentário de `lib/rate-limit.ts` afirma uma premissa que não vale mais (Baixo)

A entrada correspondente na tabela de status abaixo registra a limitação com
honestidade ("contador por processo, não por instância"). O comentário no topo
do arquivo vai um passo além e conclui: *"Para o ambiente atual (processo
único) o limite vale exatamente como configurado."* O ambiente atual é
serverless na Vercel — cada invocação pode cair numa instância diferente, cada
uma com seu próprio `Map`, e o limite efetivo é `limite × instâncias ativas`.

O risco prático continua baixo (as duas rotas esperam uma integração conhecida
como chamadora), e a decisão de não pagar um round-trip ao Postgres por
requisição continua defensável. O problema é o comentário: ele autoriza a
próxima pessoa a confiar num limite que não existe. Corrigir o texto é o
mínimo; mover o contador para armazenamento compartilhado é a correção de
verdade, quando o volume justificar.

~~**Aberto:** corrigir o texto.~~ **Corrigido em 2026-08-20** — o parágrafo
final de `lib/rate-limit.ts` deixa de afirmar "processo único" e passa a dizer
que serverless na Vercel **é** o ambiente atual, que nenhum número configurado
ali vale literalmente, e que o limite real depende de quantas instâncias a
plataforma mantiver quentes — fora do controle deste código. A decisão de não
pagar o round-trip ao Postgres segue registrada como decisão, com o gatilho
para revisitá-la (volume). Mover o contador para armazenamento compartilhado
continua sendo a correção de verdade, e continua em aberto.

### 5.5 Migrations aplicadas em produção fora da branch de onde produção sai (Médio, processo)

`0031_fecha_grants_padrao_de_escrita` e
`0032_escopo_de_grupo_na_escrita_de_sites` estão **aplicadas em produção desde
2026-08-18**, mas vivem só em `fix/grants-padrao-de-escrita` (PR #24), aberta.
`cursor/login-page-performance-lab` — a branch de onde produção é publicada —
não tem os dois arquivos. Quem ler `supabase/migrations/` nessa branch vê um
banco que não é o banco.

É exatamente a classe de problema que o cabeçalho da própria 0031 descreve ao
justificar por que a auditoria dela consultou os grants reais em vez das
migrations: *"o que as migrations dizem e o que o banco tem não eram a mesma
coisa"*. A 0031 fecha isso no nível de privilégio — `anon`/`authenticated`
tinham INSERT/UPDATE/DELETE/TRUNCATE em 11 tabelas, `visitas` e `leituras`
entre elas, herdados do `pg_default_acl` do Supabase, barrados até então
apenas por ausência de policy. Nada explorável, e mesmo assim é o achado mais
relevante em aberto: era o registro de inspeção protegido por uma camada só.
Priorizar o merge fecha o achado e a divergência de uma vez.

### Advisors do Supabase nesta rodada

`get_advisors` (security e performance) rodado em 2026-08-19 não trouxe nada
novo. Os `authenticated_security_definer_function_executable` que aparecem são
os oito casos já tratados na tabela abaixo — `authenticated` fica de fora do
revoke de propósito, e o motivo está lá. `auth_leaked_password_protection`
segue aberto como **decisão registrada**, não pendência: o toggle nativo exige
plano Pro, o upgrade foi recusado pelo dono do produto, e a compensação em
`lib/senha-vazada.ts` está documentada em `docs/melhorias.md`. Os
`unused_index` continuam sendo sinal de pouco tráfego, não de índice morto, e
esta rodada explica por quê melhor do que a anterior conseguia: com produção
vazia (0 leituras, 0 visitas — ver o item 4 da Alta prioridade em
`docs/melhorias.md`), nenhum índice teve como ser usado ainda. A decisão de
mantê-los, registrada nos fechados daquele arquivo, sai reforçada.

## Status das correções

Tudo que dependia só de código foi corrigido e verificado (`pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm run build` — todos passando):

| Item | Status |
|---|---|
| 4.1 Headers de segurança | **Feito e bloqueante** — `lib/security-headers.ts`, aplicado via `next.config.ts`. Inclui HSTS. Ver nota abaixo |
| 4.2 Dependências vulneráveis (`postcss`, `sharp`) | **Feito** — `pnpm audit` confirma 0 vulnerabilidades. Um quarto achado (`brace-expansion`, via toolchain do ESLint) apareceu só no `pnpm audit` e também foi corrigido |
| 4.3 Validação de env vars | **Feito** — `lib/env.ts` |
| 4.4 Dependabot | **Feito** — `.github/dependabot.yml` |
| 4.5 Workflow de CI | **Feito** — `.github/workflows/ci.yml`, actions fixadas por SHA completo (não por tag) |
| A07 Rate limiting no login | **Feito** — bloqueio de 30s no cliente após 5 tentativas falhas (`components/LoginForm.tsx`). É mitigação de UX, não substitui o limite do Supabase Auth no backend |
| A07 Rate limiting nas rotas de segredo compartilhado (2026-08-13) | **Feito** — `lib/rate-limit.ts` (limite por janela fixa, em memória, chave por rota+IP via `x-forwarded-for`), aplicado em `/api/importar/coletas` (20 req/min) e `/api/webhooks/user-updated` (30 req/min). Fecha o gap de que um segredo vazado (`IMPORTACAO_SECRET`/`SUPABASE_WEBHOOK_SECRET`) não tinha limite nenhum para inundar a rota — o segredo barra quem não o conhece, mas nada limitava quem o conhece. **Limitação registrada, não escondida:** contador por processo, não por instância — atrás de mais de uma réplica do servidor o limite efetivo multiplica pelo número de instâncias, e serverless na Vercel já é esse caso (ver 5.4, comentário do arquivo corrigido em 2026-08-20). O login em si fica de fora de propósito: `signInWithPassword` fala direto do navegador com o Supabase Auth, sem rota nossa no meio para interceptar — duplicar o limite exigiria proxiar o login inteiro pelo backend, e o GoTrue já limita do lado dele |
| A01 Funções `SECURITY DEFINER` executáveis via RPC por `anon`/`authenticated` (2026-08-16) | **Feito** — achado do advisor de segurança do Supabase (`anon_security_definer_function_executable` / `authenticated_security_definer_function_executable`). Migration 0027 revoga `EXECUTE` de `anon` em oito funções auxiliares de RLS (`e_cliente`, `nivel_acesso_atual`, `pode_administrar_cadastros`, `pode_administrar_grupos_usuarios`, `pode_administrar_usuarios`, `pode_ver_grupo_site`, `pode_ver_toda_operacao`, `usuario_ativo`), todas chamáveis hoje sem autenticação via `/rest/v1/rpc/<nome>`. `authenticated` fica de fora de propósito: as policies de RLS chamam essas funções nas cláusulas `USING`/`WITH CHECK`, e a chamada roda com o privilégio de quem executa a *query* (`authenticated`), não do dono da função — revogar quebraria toda policy que depende delas. Nenhuma das nove vazava dado: todas leem só a partir de `auth.uid()`, nulo para `anon`, retorno sempre `false`/`null`. Migration 0028 fecha um resíduo que a 0027 não pegou: `handle_new_user()` (trigger de `auth.users`, migration 0008) manteve acesso via `anon` *e* `authenticated` mesmo após o revoke nominal, porque — diferente das outras oito, que já nasceram com `revoke all from public` — ela manteve o grant implícito que o Postgres concede a `PUBLIC` na criação de qualquer função. `anon`/`authenticated` são membros de `PUBLIC`, então herdavam acesso por aí; revogar dos dois papéis nominalmente não tira o que vem de `PUBLIC`. A 0028 revoga de `PUBLIC` diretamente. Confirmado nos grants reais (`proacl`) antes e depois de cada migration, não só no relatório do advisor |
| A01 Grants de escrita herdados do default privilege (2026-08-18) | **Feito e aplicado em 2026-08-18** — migration 0031. `anon`/`authenticated` tinham INSERT/UPDATE/DELETE/TRUNCATE em 11 tabelas (`visitas` e `leituras` inclusive), barrados só pela ausência de policy de escrita. Ver a seção 5 abaixo |
| A01 INSERT em `profiles` alcançando `cargo` e `ativo` (2026-08-18) | **Feito e aplicado em 2026-08-18** — migration 0031, passo 5. As 0002/0007 fecharam UPDATE coluna a coluna e nunca tocaram em INSERT |
| A01 `sincronizar_membros_grupo_usuarios` executável por `anon` (2026-08-18) | **Feito e aplicado em 2026-08-18** — migration 0031, passo 6. O advisor não pega: só inspeciona `SECURITY DEFINER`, e esta é `SECURITY INVOKER` de propósito |
| A04 Rate limit contornável por `x-forwarded-for` forjado (2026-08-18) | **Feito** — `lib/rate-limit.ts` passou a preferir `x-real-ip` e, na falta dele, o **último** item da cadeia. Coberto por `lib/rate-limit.test.ts` |
| A04 Vínculo de sites sem conferência de zero linhas (2026-08-18) | **Feito** — `grupo-de-sites/actions.ts` conta as linhas devolvidas pelo `.select("id")` e recusa quando não bate com o que foi pedido |

**Nota sobre a CSP (atualizada):** a política é bloqueante desde o commit `9c56fd4` — a fase `Report-Only` descrita na versão anterior desta nota já terminou. Três coisas que mudaram junto e que não estão no snippet da seção 4.1:

- **Onde mora:** `lib/security-headers.ts`, não `next.config.ts`. O config apenas espalha `HEADERS_ESTATICOS` em `headers()`, que é o único ponto de emissão — o middleware não emite cabeçalho nenhum, e o `source: "/:path*"` cobre também `/api` e estáticos, que ficam fora do matcher dele.
- **O problema do inline continua real, e a saída não foi o nonce.** Páginas como `/` são prerenderizadas no build, sem espaço para um nonce por requisição, e a especificação manda o navegador ignorar `'unsafe-inline'` assim que existe um nonce na diretiva — os scripts do próprio Next eram bloqueados e a tela de login ficava sem formulário. `script-src` mantém `'unsafe-inline'`; o arquivo registra o custo dessa escolha e o que a política ainda garante.
- **Quatro diretivas variam entre dev e produção** (`script-src`, `connect-src`, `upgrade-insecure-requests`, HSTS). Cada uma tem no arquivo o sintoma que aparece se for aplicada no ambiente errado — vale ler antes de "limpar" alguma.

Coberto por `lib/security-headers.test.ts`.

**Descoberta durante a correção:** o projeto tinha uma inconsistência real entre gerenciadores de pacote — `.gitignore` já declarava pnpm como oficial, mas a sessão (incluindo a auditoria original) vinha instalando com npm, e o `pnpm-workspace.yaml` tinha um placeholder de aprovação de build script (`"set this to true or false"`) nunca preenchido, o que teria feito qualquer `pnpm install` limpo falhar. Corrigido: overrides movidos para `pnpm-workspace.yaml` (local correto na versão instalada do pnpm), builds de `sharp`/`unrs-resolver` aprovados explicitamente, e o CI usa pnpm.

**Lição para funções `SECURITY DEFINER` futuras:** `revoke execute ... from <papel>` só remove o que foi concedido nominalmente àquele papel — não remove o que o papel herda por ser membro de `PUBLIC`, e toda função nasce com `EXECUTE` concedido a `PUBLIC` por padrão do Postgres. Sem um `revoke all on function ... from public` (ou `revoke ... from public` específico) na própria migration que cria a função, qualquer revoke posterior por papel nominal (`anon`, `authenticated`) é inofensivo mas ineficaz — foi exatamente o que aconteceu com `handle_new_user()` acima. As funções criadas a partir da migration 0009 em diante já seguem o padrão certo (`revoke all from public` na criação); vale conferir isso em qualquer `SECURITY DEFINER` novo antes de assumir que "revoguei dos papéis errados" resolveu.

**Só dá pra resolver no GitHub, não daqui** (seção 3): branch protection, Dependabot alerts/secret scanning ligados nas Settings, e quem tem acesso `write`/`admin`. Nenhuma ferramenta aqui tem acesso à configuração do GitHub — precisa ser feito manualmente. **Atualização de 2026-08-19:** a visibilidade do repo deixou de ser incógnita (é público — achado 5.1), e a branch protection está ligada mas contornável por quem empurra (achado 5.2). As duas continuam só resolvíveis na UI do GitHub; a diferença é que agora se sabe o que resolver.

O `MELHORIAS.md` cobre o restante (testes de middleware, `error.tsx`/`loading.tsx`, etc.) e não foi duplicado aqui.

---

## 5. Auditoria de 2026-08-18 — grants em produção

Escopo pedido: RLS e políticas de acesso, validação de entrada/injeção, segredos
e `.env`, controle de sessão. Diferença de método em relação às anteriores: além
do código e das migrations, **os grants reais do banco de produção foram
consultados** (`information_schema.role_table_grants`, `column_privileges`,
`pg_default_acl`, `pg_proc.proacl`). É onde os achados apareceram — o que as
migrations dizem e o que o banco tem não eram a mesma coisa.

A mesma lição mordeu esta auditoria por outro lado, e está registrada abaixo:
os dois achados de config de Auth foram levantados lendo `supabase/config.toml`
e **caíram** quando o painel de produção foi aberto de fato. Arquivo versionado
não é estado; nem para grants, nem para config.

Nada crítico e nada explorável no estado em que o banco estava. Os três achados
de grant eram **latentes**: barrados pelo RLS por ausência de policy de escrita,
não por privilégio. O incômodo é que isso inverte a doutrina do projeto, que a
0009 enuncia assim: "o grant é pré-requisito; o RLS abaixo é o portão de
verdade". Nessas tabelas o RLS era o portão *único*.

### Achados e o que foi feito

**1. `anon` e `authenticated` com INSERT/UPDATE/DELETE/TRUNCATE em 11 tabelas.**
`visitas`, `leituras`, `grupos_sites_clientes`, `metas_visitas` e as sete de
referência. Causa raiz em `pg_default_acl`: o Supabase declara
`alter default privileges in schema public grant arwdDxtm on tables to anon,
authenticated`, então toda tabela nova nasce aberta. As migrations 0009/0012/
0015/0016 fazem o `revoke` explícito; as 0003/0004/0014 não fizeram. A 0010 já
tinha descrito exatamente este risco — e corrigiu **uma** tabela.
→ Migration **0031**, passos 1 a 4. O passo 1 (`alter default privileges ...
revoke`) é o que impede a tabela seguinte de repetir o problema.

Nota sobre `TRUNCATE`, que entrou no mesmo pacote por um motivo diferente: é a
única operação de escrita que o RLS **não** cobre — o Postgres não avalia policy
nenhuma nela, o privilégio sozinho decide. Não há caminho pelo PostgREST (ele
não expõe TRUNCATE), mas era o único grant onde a segunda camada não existia
nem em teoria.

**2. `authenticated` com INSERT em `profiles`, incluindo `cargo` e `ativo`.**
As 0002 e 0007 revogaram UPDATE e devolveram apenas `nome_completo`,
deliberadamente deixando `cargo`/`ativo` fora de qualquer grant. Nenhuma das
duas mexeu em INSERT, e o default privilege o concedia em todas as colunas — a
mesma escalada fechada na 0002 e na 0005, por outra porta.
→ Migration **0031**, passo 5.

**3. `sincronizar_membros_grupo_usuarios` executável por `anon`.** A 0026
escreveu `revoke all ... from public` + `grant execute ... to authenticated`,
mas a acl em produção mostrava `anon=X`. É a lição da 0027/0028 ao contrário:
lá o erro foi revogar dos papéis nominais e esquecer `PUBLIC`; aqui foi revogar
de `PUBLIC` e esquecer o papel nominal, que o default privilege concede. **Uma
função nova precisa fechar os dois caminhos.** Sem vazamento (a função é
`SECURITY INVOKER`, o RLS nega `anon`), mas era trabalho de banco disparável
sem autenticação. O advisor não acusa — ele só inspeciona `SECURITY DEFINER`.
→ Migration **0031**, passo 6.

**4. Rate limit contornável.** `identificarChamador` usava o primeiro item de
`x-forwarded-for`. Cada proxy *acrescenta ao fim*, então o item mais à esquerda
é o que o cliente mandou — trocá-lo a cada requisição dava um balde novo e o
limite deixava de existir justamente para quem ele foi criado para conter (quem
tem o segredo e decide inundar a rota).
→ `lib/rate-limit.ts` + testes.

**5. Vínculo de sites sem conferência de zero linhas.** O único ponto de escrita
do projeto que ainda ignorava a regra de `lib/escrita-rls.ts` — UPDATE barrado
pelo RLS não devolve erro, devolve zero linhas. `verificarEscritaComRls` não
serve ali porque decide sobre uma linha só; o equivalente em massa é comparar a
contagem com o que foi pedido, e o parcial importa tanto quanto o zero.
→ `grupo-de-sites/actions.ts` + testes.

**6. Assimetria de escopo entre `sites` e `qr_codes`.** A 0015 conjuga
`pode_administrar_cadastros()` com `pode_ver_grupo_site()`; a 0012 ficou só com
o primeiro termo. Sem efeito prático hoje (nenhum cargo acumula "administra
cadastro" e "escopo restrito"), e por isso é hardening de consistência, não
correção.
→ Migration **0032**.

### Config de Auth: dois achados retirados por inspeção direta do painel

Esta auditoria levantou dois itens de configuração do GoTrue a partir de
`supabase/config.toml` — cadastro público ligado (`enable_signup = true`) e
política de senha frouxa (`minimum_password_length = 6`,
`password_requirements = ""`). **Os dois estavam errados.**

Conferido no painel de produção em 2026-08-18:

| Configuração | Estado real |
|---|---|
| Allow new users to sign up | **desligado** |
| Allow manual linking | desligado |
| Allow anonymous sign-ins | desligado |
| Confirm email | ligado |
| Minimum password length | **8** |
| Password requirements | **Lowercase, uppercase letters, digits and symbols** |
| Secure email change | ligado |
| Secure password change | ligado |

**A lição vale mais que os dois achados:** `supabase/config.toml` é a config do
stack **local** do CLI. Ela não é aplicada ao projeto remoto e não reflete o
painel — a menos que alguém rode `supabase config push`, o que este projeto não
faz. Auditar config de Auth lendo esse arquivo produz achado falso, como
produziu aqui. **Sempre conferir no painel** (ou pela Management API); o
`config.toml` só descreve o que sobe no Docker local.

Vale notar, pelo mesmo motivo, que os dois arquivos estão **divergentes hoje**:
o `config.toml` diz `enable_signup = true` e `minimum_password_length = 6`, e a
produção diz o contrário. Alinhá-lo é higiene, não segurança — mas evita que a
próxima leitura do arquivo repita este erro, e evita que um `supabase start`
local se comporte diferente da produção.

### O que não é código e continua pendente

- **Leaked password protection** segue exigindo plano Pro; a compensação na
  aplicação (`lib/senha-vazada.ts`) continua sendo a resposta.
- **"Require current password when updating" está desligado** (achado novo, da
  inspeção do painel). Hoje quem cobre isso é a aplicação: `trocar-senha`
  reautentica com `signInWithPassword` contra a senha atual antes de chamar
  `updateUser`. Mas isso é do lado do cliente — uma sessão roubada refaz o
  `updateUser` por curl sem saber a senha atual. "Secure password change" está
  ligado e mitiga em parte (exige login nas últimas 24h), não elimina.
  **Não foi ligado de propósito:** `/nova-senha` (recuperação por e-mail) troca
  a senha justamente sem saber a antiga, e não está confirmado se o GoTrue
  isenta a sessão vinda de link de recuperação. Ligar sem testar esse fluxo
  arrisca deixar quem esqueceu a senha sem caminho de volta. Precisa de teste
  do fluxo de recuperação antes, não de um clique.

### O que foi verificado e estava correto

RLS habilitado nas 17 tabelas de `public`, todas com policy (confirmado em
`pg_class.relrowsecurity` + `pg_policies`, não só nas migrations). Sem SQL
injection: nenhum SQL cru, e o único ponto de interpolação (`.or()`) passa por
`termoParaOr`. Sem XSS: nenhum `dangerouslySetInnerHTML`/`innerHTML`/`eval`.
Zod no servidor nas cinco Server Actions, com listas fechadas, regex de UUID e
`Number.isInteger`. Nenhum arquivo de env jamais versionado; `service_role` só
dentro de `createAdminClient()`, atrás de `server-only`. Middleware com
`getUser()` (não `getSession()`), falhando fechado. As quatro rotas de `/api`
autenticam por conta própria; as duas de segredo compartilhado comparam em
tempo constante. `usuarios/actions.ts` chama `podeAdministrarUsuarios()` com o
cliente da sessão como primeira instrução, antes de qualquer escrita com
`service_role`.

### Como as migrations 0031 e 0032 foram ensaiadas e aplicadas

Sem branch de desenvolvimento no plano atual, o ensaio foi o mesmo caminho já
usado nas anteriores: o SQL da migration e o pgTAP correspondente rodados na
**mesma transação**, contra produção, terminando em `rollback`. Nada persistiu.

- `supabase/tests/database/grants_de_escrita_fechados_test.sql` — 21/21.
- `supabase/tests/database/escrita_de_sites_no_escopo_test.sql` — 8/8.

**Aplicadas em produção em 2026-08-18** (versões `20260818144318` e
`20260818144351`), depois do ensaio. Confirmado por SQL direto contra o banco,
não pelo retorno do `apply_migration`:

- `anon` tem **zero** privilégios de escrita em qualquer tabela de `public`
  (antes: INSERT/UPDATE/DELETE/TRUNCATE em 16 das 17).
- `authenticated` tem **zero** TRUNCATE em qualquer tabela.
- `visitas`, `leituras`, `grupos_sites_clientes`, `profiles`: INSERT negado.
- `profiles.nome_completo` continua editável e `profiles.cargo` continua
  fechado — o grant da 0007 sobreviveu, que era o risco de um revoke largo.
- `pg_default_acl` não concede mais escrita a `anon`/`authenticated` em tabela
  nova criada por `postgres`.
- `sincronizar_membros_grupo_usuarios`: `anon` não executa, `authenticated`
  executa.
- Advisor `security` rodado depois: **nenhum achado novo**. Continuam as oito
  `authenticated_security_definer_function_executable` (esperadas e
  inevitáveis nesta arquitetura, ver 0027) e a de leaked password (plano Pro).

Smoke test comportamental contra o banco **já migrado**, em transação com
rollback: as cinco telas de cadastro (Grupo de Sites, Site / Planta, QR Code,
Grupo de Usuários criar/editar/excluir, e a RPC de membros da 0026) — 9/9. É a
confirmação que importava, porque o risco real da 0031 nunca foi ela revogar de
menos: era revogar demais e derrubar cadastro em silêncio.

**Armadilha que moldou o primeiro arquivo, e que vale para qualquer pgTAP de
grant daqui em diante:** RLS negando por ausência de policy e GRANT faltando
levantam **o mesmo SQLSTATE 42501**. Um teste só com `throws_ok(..., '42501')`
passa idêntico antes e depois da migration e não prova nada. Os asserts
principais consultam o catálogo (`has_table_privilege`, `has_function_privilege`,
`pg_default_acl`), e os comportamentais checam a **mensagem** (`permission
denied for table ...`), não só o código.
