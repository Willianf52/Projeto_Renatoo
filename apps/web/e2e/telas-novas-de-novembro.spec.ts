import { expect, test } from "@playwright/test";
import { CONTAS, MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL } from "./suporte/ambiente";

/**
 * As telas de 25-27/11/2026 vistas de fora, no navegador:
 *
 *   - Termos de Uso e Politica de Cookies (#351): publicos, sem login, e
 *     ligados no rodape do login.
 *   - Uso do Portal (#354, 0117/0118): so para quem esta em
 *     `manutencao.quem_acompanha_o_uso`. A conta de teste do GESTOR NAO esta
 *     la (a lista nao e exposta pela API, nem para o service_role do setup),
 *     entao ela prova o portao: sem item no menu, sem atalho, e o endereco
 *     digitado volta para a Pagina Principal.
 *   - Alterar E-mails em Massa (#350): abre para quem administra cadastros e
 *     recusa o envio sem local, antes de chegar ao banco (nada e gravado).
 */

test.describe("Paginas legais sem sessao", () => {
  for (const [rota, titulo] of [
    ["/termos", "Termos de Uso"],
    ["/cookies", "Política de Cookies"],
  ] as const) {
    test(`${rota} abre sem login`, async ({ page }) => {
      await page.goto(rota);
      await expect(page).toHaveURL(rota);
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    });
  }

  test("o rodape do login liga as tres paginas", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Documentos legais" });
    await expect(links.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    await expect(links.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    await expect(links.getByRole("link", { name: "Política de Cookies" })).toHaveAttribute("href", "/cookies");
  });
});

test.describe("Telas novas com sessao do GESTOR", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("Uso do Portal: GESTOR fora da lista nao ve o item e o endereco volta para a Pagina Principal", async ({
    page,
  }) => {
    await page.goto("/dashboard/principal");

    // O menu so filtra depois que a saudacao entrega cargo e acessos.
    await expect(page.getByText(CONTAS.gestor.nome).first()).toBeVisible();
    await page.getByRole("button", { name: "Cadastros" }).first().click();
    await expect(page.getByRole("link", { name: "Usuários" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Uso do Portal" })).toHaveCount(0);

    // Nem como atalho.
    const dialogo = page.getByRole("dialog", { name: "Personalizar atalhos" });
    await page.getByRole("button", { name: "Personalizar" }).click();
    await dialogo.getByRole("searchbox", { name: "Buscar atalho" }).fill("uso do portal");
    await expect(dialogo.getByText("Uso do Portal")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/dashboard/cadastros/uso-do-portal");
    await expect(page).toHaveURL(/\/dashboard\/principal$/);

    // A planilha (rota de API, fora do layout) confere por conta propria.
    const planilha = await page.request.get("/dashboard/cadastros/uso-do-portal/export/excel");
    expect(planilha.status()).toBe(403);
  });

  test("Alterar E-mails em Massa: abre para quem administra e recusa o envio sem local", async ({ page }) => {
    await page.goto("/dashboard/cadastros/site-planta/emails-em-massa");

    await expect(page.getByRole("heading", { name: "Alterar E-mails em Massa" })).toBeVisible();
    await page.getByLabel("E-mails").fill("teste@exemplo.com");
    await page.getByLabel("Checklists").check();
    await page.getByRole("button", { name: "Alterar E-mails" }).click();

    // Filtrado pelo texto: o Next tambem poe um anunciador de rota com role "alert".
    // Folga de 30s: no `next dev` frio da CI, a primeira chamada da Server
    // Action inclui compila-la (mesmo motivo do checklist-de-campo.spec.ts).
    await expect(
      page.getByRole("alert").filter({ hasText: "Selecione ao menos um grupo de sites ou um local." }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
