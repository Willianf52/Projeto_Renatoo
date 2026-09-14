import { expect, test } from "@playwright/test";
import { CONTAS, MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL, clienteDaConta } from "./suporte/ambiente";
import { mesNoFusoOperacional, registrarRonda } from "./suporte/campo";

/**
 * Registro de Rondas com filtro de periodo, sobre uma ronda gravada pelo
 * inspetor.
 *
 * `queries.test.ts` prova a agregacao com leituras fabricadas. O que fica de
 * fora la e o que este spec exercita: o `select` com os joins de verdade
 * (`areas`, `visitas!inner`, `sites`) contra o schema atual, o recorte de mes
 * no fuso da operacao aplicado pelo PostgREST, e o RLS entregando ao gestor a
 * leitura que o inspetor gravou.
 *
 * Site proprio ("Centro de Distribuição"), que nenhum outro spec usa: a linha
 * do relatorio soma todas as rondas do Local, e um spec vizinho gravando no
 * mesmo site em paralelo mudaria o Total. A duracao de 37 minutos e so para
 * nao coincidir com nada que o seed ou outro spec produza.
 */

const SITE = "Centro de Distribuição";

test.describe("Relatório Registro de Rondas", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("ronda do mes aparece com a duracao; outro mes vem vazio", async ({ page }) => {
    const inspetor = await clienteDaConta(CONTAS.inspetor);
    const { siteId, inicio } = await registrarRonda(inspetor, { site: SITE, minutos: 37 });
    const mes = mesNoFusoOperacional(inicio);

    await page.goto(`/dashboard/inspecoes/relatorios/registro-de-rondas?mes=${mes}&local=${siteId}`);

    const linha = page.getByRole("row").filter({ hasText: SITE });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText("00:37:00");

    // Mesmo Local, mes sem nenhuma leitura: o recorte de periodo tem de
    // tirar a ronda, e nao so reordenar.
    await page.goto(`/dashboard/inspecoes/relatorios/registro-de-rondas?mes=2020-01&local=${siteId}`);

    await expect(page.getByText("Nenhuma ronda encontrada")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: SITE })).toHaveCount(0);
  });
});
