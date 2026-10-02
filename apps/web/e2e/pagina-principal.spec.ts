import { expect, test } from "@playwright/test";
import { MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL } from "./suporte/ambiente";

/**
 * Pagina Principal (0062): a grade de 12 atalhos e o "Personalizar". O caminho
 * que importa e o de ida e volta no banco -- fixar, concluir, ver o alfinete
 * depois de recarregar -- e o "Restaurar padrao", que deixa o banco como o
 * teste encontrou.
 *
 * Comeca restaurando o padrao: numa nova tentativa do Playwright, a anterior
 * pode ter parado depois de fixar, e o botao viria "Fixado" em vez de "Fixar".
 * O cartao e procurado DENTRO da grade (`listitem`): o menu lateral tem um
 * link com o mesmo nome.
 */
test.describe("Pagina Principal com sessao do GESTOR", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("mostra 12 atalhos e fixa um pelo Personalizar", async ({ page }) => {
    await page.goto("/dashboard/principal");

    await expect(page.getByRole("heading", { name: "Atalhos da Tela Inicial" })).toBeVisible();
    await expect(page.getByText("12 de 12 atalhos")).toBeVisible();

    const dialogo = page.getByRole("dialog", { name: "Personalizar atalhos" });

    await page.getByRole("button", { name: "Personalizar" }).click();
    await dialogo.getByRole("button", { name: "Restaurar padrão" }).click();
    await dialogo.getByRole("button", { name: "Concluir" }).click();
    await expect(dialogo).toBeHidden();

    await page.getByRole("button", { name: "Personalizar" }).click();
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole("searchbox", { name: "Buscar atalho" }).fill("trocar senha");
    await dialogo.getByRole("button", { name: "Fixar", exact: true }).click();
    await dialogo.getByRole("button", { name: "Concluir" }).click();
    await expect(dialogo).toBeHidden();

    await page.reload();
    const cartao = page.getByRole("listitem").getByRole("link", { name: /Trocar Senha/ });
    await expect(cartao).toBeVisible();
    await expect(cartao.getByText("Fixado")).toBeAttached();

    await page.getByRole("button", { name: "Personalizar" }).click();
    await dialogo.getByRole("button", { name: "Restaurar padrão" }).click();
    await dialogo.getByRole("button", { name: "Concluir" }).click();
    await expect(dialogo).toBeHidden();
  });
});
