import { expect, test } from "@playwright/test";

/**
 * Cobre a validação e o feedback de erro do formulário de login, sem
 * depender de nenhuma credencial real -- só o caminho de falha (campo
 * vazio, e-mail malformado, credenciais erradas) precisa ser exercitado
 * aqui. `signInWithPassword` com credenciais erradas ainda é uma chamada de
 * rede real contra o projeto Supabase de `.env.local`: é o comportamento de
 * "não encontrou o usuário" que se quer testar, não um mock dele.
 */

test.describe("Formulário de login", () => {
  test("campos vazios mostram 'Campo obrigatório' sem chamar o Supabase", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Campo obrigatório")).toHaveCount(2);
  });

  test("e-mail malformado mostra 'E-mail inválido'", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("E-mail").fill("nao-e-um-email");
    await page.getByLabel("Senha").fill("qualquer-coisa");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("E-mail inválido")).toBeVisible();
  });

  test("credenciais inexistentes mostram 'E-mail ou senha incorretos.'", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("E-mail").fill(`inexistente-${Date.now()}@teste.local`);
    await page.getByLabel("Senha").fill("senha-qualquer-123");
    await page.getByRole("button", { name: "Entrar" }).click();

    // p[role="alert"] (nao getByRole("alert") direto): o route announcer do
    // Next (#__next-route-announcer__) tambem tem role="alert" no DOM, e
    // resolveria os dois elementos em modo estrito.
    await expect(page.locator('p[role="alert"]')).toContainText("E-mail ou senha incorretos.");
  });

  /**
   * O Supabase Auth ja limita tentativas no backend; isto e a camada extra no
   * cliente (components/LoginForm.tsx). 5 tentativas com qualquer erro --
   * nao precisa ser especificamente "credenciais invalidas" -- disparam o
   * bloqueio de 30s.
   */
  test("5 tentativas falhas bloqueiam o formulário por 30s", async ({ page }) => {
    await page.goto("/");

    const email = page.getByLabel("E-mail");
    const senha = page.getByLabel("Senha");
    const entrar = page.getByRole("button", { name: "Entrar" });

    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      await email.fill(`bloqueio-${Date.now()}@teste.local`);
      await senha.fill("senha-errada");
      await entrar.click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
    }

    await expect(page.getByText(/Muitas tentativas\. Aguarde \d+s para tentar de novo\./)).toBeVisible();
    await expect(page.getByRole("button", { name: /Aguarde \d+s/ })).toBeDisabled();
  });
});
