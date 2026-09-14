import { expect, test } from "@playwright/test";
import { MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL, sufixoUnico } from "./suporte/ambiente";

/**
 * Cadastro de Site / Planta e de QR code, da tela ao banco e de volta.
 *
 * O que os testes de `actions.test.ts` nao alcancam: eles provam a action com
 * o cliente Supabase mockado. Aqui a action roda com o token real da sessao do
 * GESTOR, a policy de INSERT (0012/0032 para sites, 0015 para QR) decide de
 * verdade, e a listagem relida depois do `redirect` e a prova de que a linha
 * entrou -- e de que o RLS de leitura deixa a mesma pessoa ve-la.
 *
 * Os nomes levam sufixo unico: o stack local de quem roda duas vezes seguidas
 * nao e zerado, e a busca precisa achar a linha desta execucao, nao a da
 * anterior.
 */

test.describe("Cadastros de site e QR code", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("site cadastrado pela tela aparece na listagem", async ({ page }) => {
    const nome = `Site E2E ${sufixoUnico()}`;

    await page.goto("/dashboard/cadastros/site-planta/novo");

    await page.getByLabel("Nome do Site").fill(nome);
    await page.getByLabel("Nome abreviado do site").fill("E2E");
    await page.getByLabel("Grupo de Sites").selectOption({ label: "Rede Bom Preço" });
    await page.getByLabel("Cidade", { exact: true }).fill("Campinas");
    await page.getByLabel("UF", { exact: true }).fill("sp");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL("/dashboard/cadastros/site-planta");

    await page.goto(`/dashboard/cadastros/site-planta?busca=${encodeURIComponent(nome)}`);
    const linha = page.getByRole("row").filter({ hasText: nome });
    await expect(linha).toHaveCount(1);
    // UF sai em maiusculas: a action normaliza, e a coluna e char(2).
    await expect(linha).toContainText("SP");
    await expect(linha).toContainText("Campinas");
  });

  test("site sem grupo e recusado sem sair do formulario", async ({ page }) => {
    await page.goto("/dashboard/cadastros/site-planta/novo");

    await page.getByLabel("Nome do Site").fill(`Site sem grupo ${sufixoUnico()}`);
    await page.getByRole("button", { name: "Salvar" }).click();

    // `required` no select segura o envio no navegador; a URL nao muda.
    await expect(page).toHaveURL("/dashboard/cadastros/site-planta/novo");
    const semValor = await page
      .getByLabel("Grupo de Sites")
      .evaluate((select: HTMLSelectElement) => select.validity.valueMissing);
    expect(semValor).toBe(true);
  });

  test("QR code cadastrado pela tela aparece na listagem, amarrado ao site", async ({ page }) => {
    const codigo = `QR-E2E-${sufixoUnico().toUpperCase()}`;

    await page.goto("/dashboard/cadastros/qr-code/novo");

    await page.getByLabel("Código").fill(codigo);
    await page.getByLabel("Site / Planta").selectOption({ label: "Loja Ipiranga" });
    await page.getByLabel("Finalidade").fill("Doca de carga");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL("/dashboard/cadastros/qr-code");

    await page.goto(`/dashboard/cadastros/qr-code?busca=${encodeURIComponent(codigo)}`);
    const linha = page.getByRole("row").filter({ hasText: codigo });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText("Loja Ipiranga");
    await expect(linha).toContainText("Doca de carga");
  });

  test("QR code com espaco no codigo e recusado com a mensagem da action", async ({ page }) => {
    await page.goto("/dashboard/cadastros/qr-code/novo");

    await page.getByLabel("Código").fill("QR COM ESPACO");
    await page.getByLabel("Site / Planta").selectOption({ label: "Loja Ipiranga" });
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.locator('p[role="alert"]')).toContainText("sem espaços");
    await expect(page).toHaveURL("/dashboard/cadastros/qr-code/novo");
    // O formulario volta com o que foi digitado, nao em branco.
    await expect(page.getByLabel("Código")).toHaveValue("QR COM ESPACO");
  });
});
