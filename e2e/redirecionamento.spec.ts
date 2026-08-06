import { expect, test } from "@playwright/test";

/**
 * Cobre o middleware (lib/supabase/middleware.ts) do lado de fora: sem
 * sessão, qualquer rota protegida redireciona para "/" preservando o destino
 * em `redirectTo`, para o login devolver a pessoa pra onde ela tentou ir.
 * Não precisa de credencial nenhuma -- o caminho exercitado é o de quem
 * ainda não tem sessão.
 */
test.describe("Redirecionamento sem sessão", () => {
  test("rota protegida redireciona para / com redirectTo preservado", async ({ page }) => {
    await page.goto("/dashboard/inspecoes/coletas-importadas");

    await expect(page).toHaveURL(
      "/?redirectTo=%2Fdashboard%2Finspecoes%2Fcoletas-importadas",
    );
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("rotas públicas continuam acessíveis sem sessão", async ({ page }) => {
    await page.goto("/recuperar-senha");

    await expect(page).toHaveURL("/recuperar-senha");
  });
});
