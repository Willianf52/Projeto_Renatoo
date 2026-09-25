import { defineConfig } from "@playwright/test";

/**
 * E2E "leve": os fluxos que rodam sem Supabase local (login) e a varredura de
 * responsividade (`e2e/responsividade/`), montados para maquina com pouca
 * memoria (8 GB). Medido em 25/09/2026: a rodada soma ~1,2 GB de RAM (servidor
 * de producao + Playwright + navegador headless).
 *
 * O que NAO roda aqui: os specs que escrevem no banco (cadastro, checklist de
 * campo, relatorio) exigem o Supabase local em Docker -- guarda `STACK_LOCAL`
 * em `e2e/suporte/ambiente.ts` -- e rodam na CI (job `e2e`).
 *
 * Economia de memoria:
 *
 * - **Headless sempre.** Nenhuma janela abre; o Playwright usa o
 *   `chromium-headless-shell`, mais leve que o Chrome completo.
 * - **Um worker, um contexto por vez.** O pico de memoria e uma aba, nao uma
 *   por pagina. Mais lento que em paralelo, e de proposito.
 * - **Servidor de producao (`next start`), nao `next dev`.** O dev server com
 *   Turbopack compila cada rota na primeira visita e segura esse cache em
 *   memoria -- varrendo trinta rotas, e ele que estoura a RAM, nao o
 *   navegador. `next start` so serve o que o `next build` ja gerou; por isso
 *   o build precisa rodar antes (ver o script `test:responsividade`).
 * - **Sem relatorio HTML, sem trace, sem video, sem screenshot.** O resultado
 *   sai no terminal (`list`) e em texto em `test-results/relatorio-responsividade.txt`.
 *
 * Porta 3300, separada da 3100 (e2e) e da 3200 (desempenho), para nao
 * reaproveitar por engano um dev server que ja esteja de pe.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3300",
    headless: true,
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: {
      // `/dev/shm` pequeno (container, WSL) derruba o Chromium com pagina
      // pesada; `--disable-gpu` evita subir o processo de GPU, que headless
      // nao usa para nada aqui.
      args: ["--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions"],
    },
  },
  projects: [
    /**
     * Formulario de login (so e-mails inexistentes, nao grava nada),
     * redirecionamento sem sessao e -- com `E2E_EMAIL`/`E2E_PASSWORD` -- o
     * login real ate o painel.
     */
    {
      name: "fluxos",
      testMatch: /(login-formulario|redirecionamento|sessao-autenticada)\.spec\.ts/,
    },
    { name: "sessao", testMatch: /responsividade\/sessao\.setup\.ts/ },
    {
      name: "responsividade",
      testMatch: /responsividade\/(responsividade|analise)\.spec\.ts/,
      dependencies: ["sessao"],
    },
  ],
  webServer: {
    command: "npx next start -p 3300",
    url: "http://localhost:3300",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
