import { expect, test } from "@playwright/test";
import { CONTAS, MOTIVO_SEM_STACK, STACK_LOCAL } from "./suporte/ambiente";

/**
 * Entrar com o login do sistema de referencia, e nao com o e-mail (16/10/2026):
 * o campo "Login" aceita os dois. Sem formato de e-mail, o formulario chama
 * `/api/entrar-com-login`, que acha a conta pelo `profiles.login` e devolve a
 * sessao.
 *
 * Um login so, de proposito: o GoTrue local limita tentativas por IP (ver
 * `auth.setup.ts`).
 */

test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

test("entra com o login do sistema antigo, sem diferenciar maiuscula", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Login", { exact: true }).fill(`  ${CONTAS.inspetor.login.toLowerCase()} `);
  await page.getByRole("textbox", { name: "Senha" }).fill(CONTAS.inspetor.senha);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
