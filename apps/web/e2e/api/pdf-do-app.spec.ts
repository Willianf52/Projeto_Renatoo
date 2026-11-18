import { expect, test } from "@playwright/test";
import { CONTAS, clienteDaConta, MOTIVO_SEM_STACK, STACK_LOCAL } from "../suporte/ambiente";
import { ipDeTeste } from "./suporte";

/**
 * "Baixar PDF" do app de campo (18/11/2026): o app pede o link do PDF com o
 * proprio token e o navegador abre o link assinado. Aqui, as portas fechadas:
 * sem sessao, checklist que a pessoa nao enxerga e link forjado. A assinatura
 * e a validade do link estao em `lib/link-do-pdf.test.ts`.
 */

test.describe("POST /api/app/checklists/[id]/link-do-pdf", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test("sem o token do app, 401", async ({ request }) => {
    const resposta = await request.post("/api/app/checklists/1/link-do-pdf", { headers: ipDeTeste() });
    expect(resposta.status()).toBe(401);
  });

  test("checklist que a pessoa nao enxerga (ou nao existe), 404 sem link", async ({ request }) => {
    const cliente = await clienteDaConta(CONTAS.inspetor);
    const { data } = await cliente.auth.getSession();

    const resposta = await request.post("/api/app/checklists/999999999/link-do-pdf", {
      headers: { ...ipDeTeste(), Authorization: `Bearer ${data.session?.access_token}` },
    });

    expect(resposta.status()).toBe(404);
    expect(await resposta.text()).not.toContain("/api/app/pdf/");
  });
});

test.describe("GET /api/app/pdf/[token]", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test("link forjado nao abre PDF nenhum", async ({ request }) => {
    const resposta = await request.get(`/api/app/pdf/1.${Date.now() + 60_000}.assinatura-forjada`, {
      headers: ipDeTeste(),
    });

    expect(resposta.status()).toBe(404);
    expect(resposta.headers()["content-type"]).not.toContain("application/pdf");
  });
});
