import { expect, test } from "@playwright/test";
import { CONTAS, STACK_LOCAL } from "./suporte/ambiente";

/**
 * Cobre login -> dashboard e conta inativa barrada com a mensagem certa.
 * As duas pontas exigem uma conta real. Contra o Supabase local (a CI) as
 * contas vem do projeto `setup`; contra qualquer outro projeto elas vem das
 * env vars abaixo, e sem elas os specs pulam sozinhos.
 *
 * Para rodar contra outro projeto:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test sessao-autenticada
 *   E2E_INACTIVE_EMAIL=... E2E_INACTIVE_PASSWORD=... npx playwright test sessao-autenticada
 *
 * A conta de E2E_EMAIL precisa estar ativa (profiles.ativo = true); a de
 * E2E_INACTIVE_EMAIL precisa existir com profiles.ativo = false.
 */

// No stack local as contas existem sempre -- o projeto `setup` as cria (ver
// auth.setup.ts) --, entao estes specs deixam de depender de secret. As env
// vars continuam tendo precedencia, para rodar contra outro projeto com conta
// de teste dedicada.
const EMAIL = process.env.E2E_EMAIL ?? (STACK_LOCAL ? CONTAS.gestor.email : undefined);
const PASSWORD = process.env.E2E_PASSWORD ?? (STACK_LOCAL ? CONTAS.gestor.senha : undefined);
const INATIVO_EMAIL =
  process.env.E2E_INACTIVE_EMAIL ?? (STACK_LOCAL ? CONTAS.inativo.email : undefined);
const INATIVO_PASSWORD =
  process.env.E2E_INACTIVE_PASSWORD ?? (STACK_LOCAL ? CONTAS.inativo.senha : undefined);

test.describe("Login com conta ativa", () => {
  test.skip(!EMAIL || !PASSWORD, "requer E2E_EMAIL e E2E_PASSWORD");

  test("login bem-sucedido leva ao dashboard", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("E-mail").fill(EMAIL!);
    await page.getByRole("textbox", { name: "Senha" }).fill(PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("redirectTo preservado: login a partir de um link volta pro destino original", async ({
    page,
  }) => {
    await page.goto("/dashboard/inspecoes/coletas-importadas");
    await expect(page).toHaveURL(/redirectTo=/);

    await page.getByLabel("E-mail").fill(EMAIL!);
    await page.getByRole("textbox", { name: "Senha" }).fill(PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL("/dashboard/inspecoes/coletas-importadas");
  });
});

test.describe("Login com conta desativada", () => {
  test.skip(!INATIVO_EMAIL || !INATIVO_PASSWORD, "requer E2E_INACTIVE_EMAIL e E2E_INACTIVE_PASSWORD");

  test("conta desativada é barrada com a mensagem certa", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("E-mail").fill(INATIVO_EMAIL!);
    await page.getByRole("textbox", { name: "Senha" }).fill(INATIVO_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    // O login em si sucede (auth.users aceita a senha); quem barra é o
    // middleware, ao consultar profiles.ativo na requisicao seguinte.
    await expect(page).toHaveURL(/erro=acesso-indisponivel/);
    await expect(page.getByText("Esta conta está desativada. Procure o administrador.")).toBeVisible();
  });
});
