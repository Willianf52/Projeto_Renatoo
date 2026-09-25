import { expect, test as setup } from "@playwright/test";
import { CONTAS, STACK_LOCAL } from "../suporte/ambiente";
import { SESSAO_DA_VARREDURA } from "./analise";

/**
 * Login uma vez, antes da varredura, e a sessao gravada em arquivo -- as
 * dezenas de paginas do painel reaproveitam o arquivo em vez de logar cada
 * uma (o GoTrue limita tentativas de login por IP).
 *
 * A conta vem de `E2E_EMAIL`/`E2E_PASSWORD` ou, no Supabase local da CI, do
 * gestor que `auth.setup.ts` cria. Sem nenhuma das duas, este passo se pula e
 * a varredura cobre so as paginas publicas (login e recuperar senha).
 *
 * A varredura so NAVEGA: nao preenche nem envia formulario nenhum. Por isso
 * pode rodar contra o Supabase de producao com uma conta real sem gravar nada.
 */

const EMAIL = process.env.E2E_EMAIL ?? (STACK_LOCAL ? CONTAS.gestor.email : undefined);
const SENHA = process.env.E2E_PASSWORD ?? (STACK_LOCAL ? CONTAS.gestor.senha : undefined);

// No nivel do arquivo, e nao dentro do teste: dentro, o fixture `page` ja
// teria aberto um navegador so para descobrir que nao havia nada a fazer.
setup.skip(!EMAIL || !SENHA, "sem E2E_EMAIL/E2E_PASSWORD: so as paginas publicas serao varridas");

setup("sessao para a varredura do painel", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(EMAIL!);
  await page.getByRole("textbox", { name: "Senha" }).fill(SENHA!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: SESSAO_DA_VARREDURA });
});
