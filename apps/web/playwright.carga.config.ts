import { defineConfig } from "@playwright/test";

/**
 * Teste de carga (e2e/carga/carga.spec.ts) contra o build de producao.
 *
 * Mesmo arranjo da playwright.desempenho.config.ts: `next start` sobre um
 * `next build` ja feito, nunca `next dev` -- o dev compila sob demanda, e a
 * primeira requisicao de cada tela mediria o bundler. Porta propria para as
 * duas configs poderem rodar em sequencia no mesmo job.
 *
 * `workers: 1` e sem retry: a concorrencia e o proprio teste que cria (varios
 * fluxos com Promise.all). Worker a mais so disputaria CPU com a medicao, e
 * repetir ate passar esconderia justamente a falha sob concorrencia.
 */
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-carga", open: "never" }]],
  use: {
    baseURL: "http://localhost:3300",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "carga",
      testMatch: /carga\/carga\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npx next start -p 3300",
    url: "http://localhost:3300",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
