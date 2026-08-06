import { defineConfig, devices } from "@playwright/test";

/**
 * Cobre login -> dashboard, redirectTo preservado e conta inativa barrada
 * (item de MELHORIAS.md). `webServer` sobe o mesmo comando de dev do
 * package.json (`--turbopack`): o comando de preview/produção usa webpack, e
 * os dois bundlers nao compartilham o formato de `.next` -- ver o commit
 * "Alinha o launch.json ao bundler do script de dev" para o sintoma de
 * misturar os dois na mesma pasta.
 *
 * `E2E_EMAIL`/`E2E_PASSWORD` (e `E2E_INACTIVE_EMAIL`/`E2E_INACTIVE_PASSWORD`)
 * nao existem neste ambiente -- os specs que precisam de uma conta real
 * pulam sozinhos quando as env vars faltam (`test.skip(...)`). O restante
 * (validação do formulário, credenciais inválidas, `redirectTo`, bloqueio
 * por tentativas) roda sem nenhuma credencial.
 *
 * `localhost`, nao `127.0.0.1`: `allowedDevOrigins` em next.config.ts lista
 * os IPs de rede da maquina, mas exclui interfaces internas -- 127.0.0.1 cai
 * fora e o dev server bloqueia os assets de /_next/* como origem estranha.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev --turbopack -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
