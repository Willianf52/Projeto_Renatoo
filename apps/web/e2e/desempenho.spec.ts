import { expect, test, type Page } from "@playwright/test";
import { MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL } from "./suporte/ambiente";

/**
 * Orcamento de desempenho (P2-3 da auditoria de 11/09).
 *
 * Roda contra o BUILD DE PRODUCAO (`next build` + `next start`, ver
 * playwright.desempenho.config.ts), nunca contra o `next dev`: o dev serve JS
 * sem minificar, com HMR e compilacao sob demanda, e qualquer numero medido
 * nele diria respeito ao bundler, nao ao que o inspetor recebe.
 *
 * O QUE TRAVA E O QUE SO INFORMA. Numero de tempo (LCP, TTFB) num runner
 * compartilhado do GitHub oscila de uma execucao para outra -- um portao sobre
 * ele seria intermitente, e portao intermitente vira `continue-on-error`. O
 * portao fica sobre o que e deterministico para o mesmo codigo:
 *
 *   - bytes de JS transferidos na primeira carga (o que o 4G paga);
 *   - numero de requisicoes;
 *   - CLS, que depende do layout e nao do relogio.
 *
 * LCP e TTFB saem como anotacao do teste, para acompanhar tendencia.
 *
 * O ORCAMENTO E O VALOR DE HOJE, com folga de 10%, pela mesma logica do piso
 * de cobertura: trava a regressao antes de perseguir meta. Mediu menos num PR
 * de melhoria? Baixe o numero no mesmo PR.
 */

type Orcamento = { jsKb: number; requisicoes: number };

/** CLS "bom" pelo criterio do Core Web Vitals. */
const CLS_MAXIMO = 0.1;

/**
 * `null` = ainda sem numero medido: a tela so registra. Preenchido a partir da
 * primeira execucao na CI (anotacoes `js-kb` e `requisicoes` do relatorio).
 */
const ORCAMENTOS: Record<string, Orcamento | null> = {
  login: null,
  "coletas-importadas": null,
  "registro-de-rondas": null,
  "site-planta": null,
  "historico-de-checklist": null,
};

type Medicao = {
  jsKb: number;
  requisicoes: number;
  cls: number;
  lcpMs: number | null;
  ttfbMs: number;
};

async function medir(page: Page): Promise<Medicao> {
  // Esqueletos de `<Suspense>` sumindo = a tela terminou de chegar. Um segundo
  // a mais para o LCP e o CLS assentarem.
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1_000);

  return page.evaluate(async () => {
    const recursos = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = recursos.filter(
      (r) => r.initiatorType === "script" || /\.m?js(\?|$)/.test(new URL(r.name).pathname),
    );
    const bytesJs = js.reduce((total, r) => total + (r.transferSize || r.encodedBodySize), 0);

    const entradasBufferizadas = (tipo: string) =>
      new Promise<PerformanceEntry[]>((resolve) => {
        try {
          new PerformanceObserver((lista, observador) => {
            observador.disconnect();
            resolve(lista.getEntries());
          }).observe({ type: tipo, buffered: true });
          // Sem entrada nenhuma o callback nunca dispara.
          setTimeout(() => resolve([]), 500);
        } catch {
          resolve([]);
        }
      });

    const deslocamentos = (await entradasBufferizadas("layout-shift")) as (PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
    })[];
    const lcp = await entradasBufferizadas("largest-contentful-paint");
    const navegacao = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;

    return {
      jsKb: Math.round(bytesJs / 1024),
      requisicoes: recursos.length + 1,
      cls: Number(
        deslocamentos.filter((d) => !d.hadRecentInput).reduce((t, d) => t + d.value, 0).toFixed(3),
      ),
      lcpMs: lcp.length ? Math.round(lcp[lcp.length - 1].startTime) : null,
      ttfbMs: Math.round(navegacao.responseStart),
    };
  });
}

function registrarEConferir(nome: string, medicao: Medicao) {
  const anotacoes = test.info().annotations;
  for (const [chave, valor] of Object.entries(medicao)) {
    anotacoes.push({ type: chave, description: String(valor) });
  }
  // Uma linha por tela no log da CI, para ler sem baixar o relatorio.
  console.log(`[desempenho] ${nome} ${JSON.stringify(medicao)}`);

  expect(medicao.cls, `CLS de ${nome}`).toBeLessThanOrEqual(CLS_MAXIMO);

  const orcamento = ORCAMENTOS[nome];
  if (!orcamento) return;

  expect(medicao.jsKb, `JS transferido em ${nome} (kB)`).toBeLessThanOrEqual(orcamento.jsKb);
  expect(medicao.requisicoes, `requisicoes em ${nome}`).toBeLessThanOrEqual(orcamento.requisicoes);
}

test.describe("Desempenho sem sessao", () => {
  test("login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    registrarEConferir("login", await medir(page));
  });
});

/**
 * As telas que a operacao mais abre (auditoria, P2-3). `/dashboard` fica de
 * fora: so redireciona para Coletas Importadas, e medir no meio do redirect
 * mede a troca, nao a tela.
 */
const TELAS_COM_SESSAO: [nome: string, caminho: string][] = [
  ["coletas-importadas", "/dashboard/inspecoes/coletas-importadas"],
  ["registro-de-rondas", "/dashboard/inspecoes/relatorios/registro-de-rondas"],
  ["site-planta", "/dashboard/cadastros/site-planta"],
  ["historico-de-checklist", "/dashboard/checklistlab/historico-de-checklist"],
];

test.describe("Desempenho com sessao do GESTOR", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  for (const [nome, caminho] of TELAS_COM_SESSAO) {
    test(nome, async ({ page }) => {
      await page.goto(caminho);
      await expect(page).toHaveURL(caminho);
      registrarEConferir(nome, await medir(page));
    });
  }
});
