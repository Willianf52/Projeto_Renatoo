import { expect, test } from "@playwright/test";
import {
  CONTAS,
  MOTIVO_SEM_STACK,
  SESSAO_DO_GESTOR,
  STACK_LOCAL,
  clienteDaConta,
  sufixoUnico,
} from "./suporte/ambiente";
import { enviarChecklistCorretivo, registrarRonda } from "./suporte/campo";

/**
 * O caminho que atravessa os dois apps: o inspetor fecha uma visita em campo e
 * a gestao a encontra no Historico de Checklist.
 *
 * E o fluxo mais caro de quebrar em silencio. O app escreve com um contrato
 * (policies da 0042, check de caminho da 0045, tipo de midia da 0046), o
 * painel le com outro (`pode_ver_visita`, rotas de midia sob a sessao), e
 * nenhum teste unitario cobre os dois lados juntos -- cada um mocka o outro.
 */

test.describe("Checklist enviado pelo app aparece no painel", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("corretiva do inspetor: listagem, detalhe e assinatura", async ({ page }) => {
    const inspetor = await clienteDaConta(CONTAS.inspetor);
    const motivo = `Porta de emergencia travada ${sufixoUnico()}`;

    const { visitaId } = await registrarRonda(inspetor, { site: "Agência Centro", minutos: 20 });
    const checklistId = await enviarChecklistCorretivo(inspetor, visitaId, motivo);

    // Reenvio da mesma visita: a unique de `visita_id` recusa, e o app traduz
    // 23505 para "ja finalizada". Um segundo checklist aqui seria a inspecao
    // duplicada que a constraint existe para impedir.
    const reenvio = await inspetor.rpc("registrar_checklist", {
      p_visita_id: visitaId,
      p_tipo: "CORRETIVA",
      p_motivo: motivo,
      p_assinatura_path: `${visitaId}/assinatura-reenvio.png`,
      p_fotos: [],
      p_respostas: [],
    });
    expect(reenvio.error?.code).toBe("23505");

    await page.goto(
      `/dashboard/checklistlab/historico-de-checklist?busca=${encodeURIComponent(motivo)}`,
    );

    const linha = page.getByRole("row").filter({ hasText: motivo });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText("Agência Centro");

    await linha.getByRole("link", { name: `Ver checklist ${checklistId}` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/checklistlab/historico-de-checklist/${checklistId}\\?`),
    );

    // No cartao da corretiva, e nao em qualquer lugar da pagina: o motivo
    // tambem aparece no resumo, e o que se quer provar e que o cartao proprio
    // da CORRETIVA foi montado com o texto que o inspetor mandou.
    const cartaoDoMotivo = page
      .getByRole("heading", { name: "Motivo da visita corretiva" })
      .locator("xpath=../following-sibling::p");
    await expect(cartaoDoMotivo).toHaveText(motivo);

    // A assinatura vem do bucket privado pela rota do painel, com a sessao do
    // gestor. `naturalWidth` > 0 prova que chegaram bytes de imagem, e nao so
    // que a tag existe -- um 404 renderiza o mesmo <img> quebrado.
    const assinatura = page.getByRole("img", { name: `Assinatura do checklist ${checklistId}` });
    await expect(assinatura).toBeVisible();
    //
    // Sempre numero (0 enquanto carrega): `complete && naturalWidth` devolvia
    // `false`, que o matcher recusa. Folga de 30s porque, no `next dev` frio da
    // CI, a primeira ida a rota da assinatura inclui compila-la.
    await expect
      .poll(
        () => assinatura.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });

  // Pelo texto, e nao pelo status HTTP: com Cache Components o `notFound()`
  // pode chegar depois de a casca ja ter saido com 200, e o que a pessoa ve
  // e o que importa aqui.
  test("id de checklist inexistente cai na pagina de nao encontrado", async ({ page }) => {
    await page.goto("/dashboard/checklistlab/historico-de-checklist/999999999");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
  });
});
