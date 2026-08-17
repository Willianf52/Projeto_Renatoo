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
- Confirmar se o repositório é público ou privado intencionalmente — não tenho como verificar daqui.
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
| A07 Rate limiting nas rotas de segredo compartilhado (2026-08-13) | **Feito** — `lib/rate-limit.ts` (limite por janela fixa, em memória, chave por rota+IP via `x-forwarded-for`), aplicado em `/api/importar/coletas` (20 req/min) e `/api/webhooks/user-updated` (30 req/min). Fecha o gap de que um segredo vazado (`IMPORTACAO_SECRET`/`SUPABASE_WEBHOOK_SECRET`) não tinha limite nenhum para inundar a rota — o segredo barra quem não o conhece, mas nada limitava quem o conhece. **Limitação registrada, não escondida:** contador por processo, não por instância — atrás de mais de uma réplica do servidor o limite efetivo multiplica pelo número de instâncias. O login em si fica de fora de propósito: `signInWithPassword` fala direto do navegador com o Supabase Auth, sem rota nossa no meio para interceptar — duplicar o limite exigiria proxiar o login inteiro pelo backend, e o GoTrue já limita do lado dele |
| A01 Funções `SECURITY DEFINER` executáveis via RPC por `anon`/`authenticated` (2026-08-16) | **Feito** — achado do advisor de segurança do Supabase (`anon_security_definer_function_executable` / `authenticated_security_definer_function_executable`). Migration 0027 revoga `EXECUTE` de `anon` em oito funções auxiliares de RLS (`e_cliente`, `nivel_acesso_atual`, `pode_administrar_cadastros`, `pode_administrar_grupos_usuarios`, `pode_administrar_usuarios`, `pode_ver_grupo_site`, `pode_ver_toda_operacao`, `usuario_ativo`), todas chamáveis hoje sem autenticação via `/rest/v1/rpc/<nome>`. `authenticated` fica de fora de propósito: as policies de RLS chamam essas funções nas cláusulas `USING`/`WITH CHECK`, e a chamada roda com o privilégio de quem executa a *query* (`authenticated`), não do dono da função — revogar quebraria toda policy que depende delas. Nenhuma das nove vazava dado: todas leem só a partir de `auth.uid()`, nulo para `anon`, retorno sempre `false`/`null`. Migration 0028 fecha um resíduo que a 0027 não pegou: `handle_new_user()` (trigger de `auth.users`, migration 0008) manteve acesso via `anon` *e* `authenticated` mesmo após o revoke nominal, porque — diferente das outras oito, que já nasceram com `revoke all from public` — ela manteve o grant implícito que o Postgres concede a `PUBLIC` na criação de qualquer função. `anon`/`authenticated` são membros de `PUBLIC`, então herdavam acesso por aí; revogar dos dois papéis nominalmente não tira o que vem de `PUBLIC`. A 0028 revoga de `PUBLIC` diretamente. Confirmado nos grants reais (`proacl`) antes e depois de cada migration, não só no relatório do advisor |

**Nota sobre a CSP (atualizada):** a política é bloqueante desde o commit `9c56fd4` — a fase `Report-Only` descrita na versão anterior desta nota já terminou. Três coisas que mudaram junto e que não estão no snippet da seção 4.1:

- **Onde mora:** `lib/security-headers.ts`, não `next.config.ts`. O config apenas espalha `HEADERS_ESTATICOS` em `headers()`, que é o único ponto de emissão — o middleware não emite cabeçalho nenhum, e o `source: "/:path*"` cobre também `/api` e estáticos, que ficam fora do matcher dele.
- **O problema do inline continua real, e a saída não foi o nonce.** Páginas como `/` são prerenderizadas no build, sem espaço para um nonce por requisição, e a especificação manda o navegador ignorar `'unsafe-inline'` assim que existe um nonce na diretiva — os scripts do próprio Next eram bloqueados e a tela de login ficava sem formulário. `script-src` mantém `'unsafe-inline'`; o arquivo registra o custo dessa escolha e o que a política ainda garante.
- **Quatro diretivas variam entre dev e produção** (`script-src`, `connect-src`, `upgrade-insecure-requests`, HSTS). Cada uma tem no arquivo o sintoma que aparece se for aplicada no ambiente errado — vale ler antes de "limpar" alguma.

Coberto por `lib/security-headers.test.ts`.

**Descoberta durante a correção:** o projeto tinha uma inconsistência real entre gerenciadores de pacote — `.gitignore` já declarava pnpm como oficial, mas a sessão (incluindo a auditoria original) vinha instalando com npm, e o `pnpm-workspace.yaml` tinha um placeholder de aprovação de build script (`"set this to true or false"`) nunca preenchido, o que teria feito qualquer `pnpm install` limpo falhar. Corrigido: overrides movidos para `pnpm-workspace.yaml` (local correto na versão instalada do pnpm), builds de `sharp`/`unrs-resolver` aprovados explicitamente, e o CI usa pnpm.

**Lição para funções `SECURITY DEFINER` futuras:** `revoke execute ... from <papel>` só remove o que foi concedido nominalmente àquele papel — não remove o que o papel herda por ser membro de `PUBLIC`, e toda função nasce com `EXECUTE` concedido a `PUBLIC` por padrão do Postgres. Sem um `revoke all on function ... from public` (ou `revoke ... from public` específico) na própria migration que cria a função, qualquer revoke posterior por papel nominal (`anon`, `authenticated`) é inofensivo mas ineficaz — foi exatamente o que aconteceu com `handle_new_user()` acima. As funções criadas a partir da migration 0009 em diante já seguem o padrão certo (`revoke all from public` na criação); vale conferir isso em qualquer `SECURITY DEFINER` novo antes de assumir que "revoguei dos papéis errados" resolveu.

**Só dá pra resolver no GitHub, não daqui** (seção 3): branch protection, Dependabot alerts/secret scanning ligados nas Settings, confirmação de visibilidade do repo e de quem tem acesso `write`/`admin`. Nenhuma ferramenta aqui tem acesso à configuração do GitHub — precisa ser feito manualmente.

O `MELHORIAS.md` cobre o restante (testes de middleware, `error.tsx`/`loading.tsx`, etc.) e não foi duplicado aqui.
