import { expect, test as setup } from "@playwright/test";
import {
  CONTAS,
  MOTIVO_SEM_STACK,
  SESSAO_DO_GESTOR,
  STACK_LOCAL,
  clienteAdministrativo,
  type Conta,
} from "./suporte/ambiente";

/**
 * Projeto `setup` do Playwright: roda uma vez, antes dos specs.
 *
 * 1) Garante as contas do stack local. Conta de autenticacao nao tem tela
 *    neste sistema (a 0008 fechou o signup), e `cargo`/`ativo` so mudam por
 *    `service_role` -- o trigger da 0039 barra a mudanca vinda de sessao. E o
 *    unico lugar dos testes em que a service_role escreve.
 *
 * 2) Faz o login do GESTOR pela tela, uma vez, e grava a sessao. Os specs de
 *    fluxo reaproveitam o arquivo em vez de logar cada um: o GoTrue local
 *    limita tentativas por IP (`sign_in_sign_ups` no config.toml), e com
 *    `retries: 2` na CI um login por teste chegaria perto do teto.
 *
 * Idempotente: rodar de novo contra o mesmo stack so realinha senha, cargo e
 * situacao das contas.
 */

setup.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

async function garantirConta(conta: Conta) {
  const admin = clienteAdministrativo();

  let id: string | undefined;

  const criada = await admin.auth.admin.createUser({
    email: conta.email,
    password: conta.senha,
    email_confirm: true,
  });

  if (criada.data.user) {
    id = criada.data.user.id;
  } else {
    // Ja existe de uma execucao anterior contra o mesmo stack. `listUsers`
    // pagina, mas o stack de teste tem meia duzia de contas.
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`listUsers falhou: ${error.message}`);

    id = data.users.find((u) => u.email === conta.email)?.id;
    if (!id) throw new Error(`Nao consegui criar nem achar ${conta.email}: ${criada.error?.message}`);

    const { error: erroDaSenha } = await admin.auth.admin.updateUserById(id, { password: conta.senha });
    if (erroDaSenha) throw new Error(`Nao consegui realinhar a senha de ${conta.email}: ${erroDaSenha.message}`);
  }

  // A linha de `profiles` nasce do trigger `handle_new_user`, inativa (0008).
  const { data: perfil, error } = await admin
    .from("profiles")
    .update({ cargo: conta.cargo, ativo: conta.ativo, nome_completo: conta.nome })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !perfil) {
    throw new Error(`Perfil de ${conta.email} nao foi atualizado: ${error?.message ?? "linha ausente"}`);
  }
}

setup("contas do stack local e sessao do gestor", async ({ page }) => {
  for (const conta of Object.values(CONTAS)) {
    await garantirConta(conta);
  }

  await page.goto("/");
  await page.getByLabel("E-mail").fill(CONTAS.gestor.email);
  await page.getByRole("textbox", { name: "Senha" }).fill(CONTAS.gestor.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: SESSAO_DO_GESTOR });
});
