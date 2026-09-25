import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_VARREDURA, analisarLayout, coletarLayout } from "./analise";

/**
 * Varre cada pagina em cada tamanho de tela, em modo headless, e acusa quebra
 * estrutural (criterios em `analise.ts`). Alem do resultado de cada teste, ao
 * fim grava um relatorio em texto em `test-results/relatorio-responsividade.txt`.
 *
 * Um contexto de navegador por teste, aberto e fechado na hora: com um worker
 * so (ver a config), o pico de memoria e UMA aba, nao uma por pagina.
 *
 * Filtros por env var, para uma rodada rapida:
 *   RESPONSIVIDADE_TELAS=tablet        so os tamanhos cujo nome contem "tablet"
 *   RESPONSIVIDADE_PAGINAS=cadastros   so as paginas cujo caminho contem "cadastros"
 */

type Tela = { nome: string; largura: number; altura: number; toque: boolean };

const TELAS: Tela[] = [
  { nome: "desktop-full-hd", largura: 1920, altura: 1080, toque: false },
  { nome: "notebook", largura: 1366, altura: 768, toque: false },
  { nome: "tablet-paisagem", largura: 1280, altura: 800, toque: true },
  { nome: "tablet-retrato", largura: 800, altura: 1280, toque: true },
  { nome: "tablet-pequeno-paisagem", largura: 1024, altura: 768, toque: true },
  { nome: "tablet-pequeno-retrato", largura: 768, altura: 1024, toque: true },
];

const PAGINAS_PUBLICAS = ["/", "/recuperar-senha"];

/** As telas de listagem e de formulario do menu. Paginas de exportar ficam de
 * fora: a de PDF abre o dialogo de impressao, e a de Excel e download. */
const PAGINAS_DO_PAINEL = [
  "/dashboard/inspecoes/coletas-importadas",
  "/dashboard/inspecoes/relatorios/horas-por-usuario",
  "/dashboard/inspecoes/relatorios/inspecoes-inicio-fim-visita",
  "/dashboard/inspecoes/relatorios/mapa-de-locais-inspecionados",
  "/dashboard/inspecoes/relatorios/ranking-de-inspecoes",
  "/dashboard/inspecoes/relatorios/registro-de-rondas",
  "/dashboard/inspecoes/relatorios/visitas-de-supervisao",
  "/dashboard/eventos/relatorios/eventos-por-site",
  "/dashboard/eventos/relatorios/graficos-de-eventos",
  "/dashboard/eventos/relatorios/mapa-de-eventos",
  "/dashboard/eventos/relatorios/mapa-de-eventos-por-site",
  "/dashboard/eventos/relatorios/ranking-nao-conformidades",
  "/dashboard/eventos/relatorios/registro-de-eventos",
  "/dashboard/eventos/relatorios/tempo-medio-resolucao-nao-conformidades",
  "/dashboard/cadastros/site-planta",
  "/dashboard/cadastros/site-planta/novo",
  "/dashboard/cadastros/grupo-de-sites",
  "/dashboard/cadastros/grupo-de-sites/novo",
  "/dashboard/cadastros/grupo-de-sites/importar",
  "/dashboard/cadastros/usuarios",
  "/dashboard/cadastros/usuarios/novo",
  "/dashboard/cadastros/grupo-de-usuarios",
  "/dashboard/cadastros/grupo-de-usuarios/novo",
  "/dashboard/cadastros/qr-code",
  "/dashboard/cadastros/qr-code/novo",
  "/dashboard/cadastros/trocar-senha",
  "/dashboard/checklistlab/perguntas",
  "/dashboard/checklistlab/perguntas/novo",
  "/dashboard/checklistlab/historico-de-checklist",
];

const filtroDeTela = process.env.RESPONSIVIDADE_TELAS;
const filtroDePagina = process.env.RESPONSIVIDADE_PAGINAS;

const telas = TELAS.filter((t) => !filtroDeTela || t.nome.includes(filtroDeTela));
const paginas = [
  ...PAGINAS_PUBLICAS.map((caminho) => ({ caminho, logada: false })),
  ...PAGINAS_DO_PAINEL.map((caminho) => ({ caminho, logada: true })),
].filter((p) => !filtroDePagina || p.caminho.includes(filtroDePagina));

type Linha = { tela: string; caminho: string; situacao: "OK" | "ERRO" | "PULADA"; detalhes: string[] };
const relatorio: Linha[] = [];

for (const tela of telas) {
  test.describe(`${tela.nome} (${tela.largura}x${tela.altura})`, () => {
    for (const { caminho, logada } of paginas) {
      test(caminho, async ({ browser, baseURL }) => {
        if (logada && !existsSync(SESSAO_DA_VARREDURA)) {
          relatorio.push({ tela: tela.nome, caminho, situacao: "PULADA", detalhes: ["sem sessão (defina E2E_EMAIL/E2E_PASSWORD)"] });
          test.skip(true, "sem sessao: defina E2E_EMAIL e E2E_PASSWORD para varrer o painel");
        }

        const contexto = await browser.newContext({
          baseURL,
          viewport: { width: tela.largura, height: tela.altura },
          hasTouch: tela.toque,
          storageState: logada ? SESSAO_DA_VARREDURA : undefined,
        });

        try {
          const page = await contexto.newPage();
          await page.goto(caminho);
          // Espera o conteudo de verdade, nao o esqueleto do Suspense: mede-se
          // o layout final. Pagina de mapa pode nunca ficar ociosa (tiles), dai
          // o teto em vez de exigir.
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

          if (logada && !new URL(page.url()).pathname.startsWith("/dashboard")) {
            throw new Error(`Sessão recusada: a página foi redirecionada para ${page.url()}.`);
          }

          const problemas = analisarLayout(await coletarLayout(page));
          relatorio.push({ tela: tela.nome, caminho, situacao: problemas.length ? "ERRO" : "OK", detalhes: problemas });

          expect(problemas, `Quebras em ${caminho} (${tela.nome})`).toEqual([]);
        } catch (falha) {
          if (!relatorio.some((l) => l.tela === tela.nome && l.caminho === caminho)) {
            relatorio.push({ tela: tela.nome, caminho, situacao: "ERRO", detalhes: [String(falha)] });
          }
          throw falha;
        } finally {
          await contexto.close();
        }
      });
    }
  });
}

test.afterAll(() => {
  if (relatorio.length === 0) return;

  const comErro = relatorio.filter((l) => l.situacao === "ERRO").length;
  const puladas = relatorio.filter((l) => l.situacao === "PULADA").length;

  const linhas = [
    `Relatório de responsividade — ${new Date().toLocaleString("pt-BR")}`,
    `Verificações: ${relatorio.length} | com problema: ${comErro} | puladas: ${puladas}`,
    "",
  ];

  for (const tela of telas) {
    const daTela = relatorio.filter((l) => l.tela === tela.nome);
    if (daTela.length === 0) continue;

    linhas.push(`== ${tela.nome} (${tela.largura}x${tela.altura})`);
    for (const linha of daTela) {
      linhas.push(`  [${linha.situacao}] ${linha.caminho}`);
      for (const detalhe of linha.detalhes) linhas.push(`      - ${detalhe}`);
    }
    linhas.push("");
  }

  const arquivo = "test-results/relatorio-responsividade.txt";
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, linhas.join("\n"), "utf-8");
  console.log(`\nRelatório em texto: ${arquivo}`);
});
