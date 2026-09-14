import { defineConfig, devices } from "@playwright/test";

/**
 * Orcamento de desempenho (e2e/desempenho.spec.ts) contra o build de producao.
 *
 * Config separada da `playwright.config.ts` porque o servidor e outro: aqui e
 * `next start` sobre um `next build` ja feito, e la e `next dev`. Os numeros
 * de bundle so fazem sentido no primeiro.
 *
 * `workers: 1` e sem retry: medicao em paralelo disputa CPU e rede com ela
 * mesma, e repetir ate passar esconderia exatamente a regressao que o
 * orcamento existe para pegar.
 */
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-desempenho", open: "never" }]],
  use: {
    baseURL: "http://localhost:3200",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "desempenho",
      testMatch: /desempenho\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npx next start -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
