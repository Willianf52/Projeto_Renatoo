import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL } from "./suporte/ambiente";

/**
 * Acessibilidade em pagina renderizada (P2-2 da auditoria de 11/09).
 *
 * O `eslint-plugin-jsx-a11y` do lint ja pega atributo faltando no JSX. O que
 * ele nao alcanca e o que so existe depois de renderizar: contraste no tema
 * escuro, rotulo que o componente monta em tempo de execucao, landmark e
 * hierarquia de titulo da pagina inteira (layout + tela). E isso que o axe
 * confere aqui, pegando carona no navegador que o Playwright ja abre.
 *
 * O PORTAO: violacao `critical` ou `serious` reprova. `moderate`/`minor` sai
 * no relatorio anexado ao teste, sem bloquear -- mesmo criterio do piso de
 * cobertura: travar o que ja se tem antes de perseguir meta.
 *
 * As regras sao as de WCAG 2.0/2.1/2.2 nos niveis A e AA, que e o que um
 * contrato com orgao publico ou empresa grande cobra por escrito.
 */

const TAGS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function conferirAcessibilidade(page: Page, nome: string) {
  // Os esqueletos de `<Suspense>` pulsam ate o dado chegar; auditar antes
  // disso conferiria a silhueta, nao a tela.
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });

  const resultado = await new AxeBuilder({ page }).withTags(TAGS_WCAG).analyze();

  await test.info().attach(`axe-${nome}.json`, {
    body: JSON.stringify(resultado.violations, null, 2),
    contentType: "application/json",
  });

  const graves = resultado.violations
    .filter((violacao) => violacao.impact === "critical" || violacao.impact === "serious")
    .map((violacao) => ({
      regra: violacao.id,
      impacto: violacao.impact,
      descricao: violacao.help,
      alvos: violacao.nodes.slice(0, 5).map((no) => no.target.join(" ")),
    }));

  expect(graves, `violacoes graves de acessibilidade em ${nome}`).toEqual([]);
}

test.describe("Acessibilidade sem sessao", () => {
  test("tela de login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await conferirAcessibilidade(page, "login");
  });
});

/**
 * As telas que a operacao mais abre: o painel inicial, as duas listagens de
 * Inspecoes com mais filtro, um cadastro com formulario e o historico de
 * checklist. Precisam do stack local pela sessao do GESTOR (auth.setup.ts).
 */
const TELAS_COM_SESSAO: [nome: string, caminho: string][] = [
  ["dashboard", "/dashboard"],
  ["coletas-importadas", "/dashboard/inspecoes/coletas-importadas"],
  ["registro-de-rondas", "/dashboard/inspecoes/relatorios/registro-de-rondas"],
  ["site-planta", "/dashboard/cadastros/site-planta"],
  ["site-planta-novo", "/dashboard/cadastros/site-planta/novo"],
  ["historico-de-checklist", "/dashboard/checklistlab/historico-de-checklist"],
];

test.describe("Acessibilidade com sessao do GESTOR", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  for (const [nome, caminho] of TELAS_COM_SESSAO) {
    test(nome, async ({ page }) => {
      await page.goto(caminho);
      await expect(page).toHaveURL(caminho);
      await conferirAcessibilidade(page, nome);
    });
  }
});
