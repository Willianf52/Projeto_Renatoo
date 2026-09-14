import { expect, test } from "@playwright/test";
import { MOTIVO_SEM_STACK, STACK_LOCAL } from "../suporte/ambiente";
import { ipDeTeste } from "./suporte";

/**
 * Rotas de `/api` que respondem sem sessao nem segredo: o health check (P0-5)
 * e a versao minima que o app de campo consulta antes do login.
 *
 * O que os testes de unidade (lib/saude.test.ts etc.) nao alcancam: a rota de
 * verdade, com o limite de taxa compartilhado no Postgres e o banco real
 * respondendo por tras.
 */

test.describe("GET /api/health", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test("responde com o formato do monitor e nao deixa guardar em cache", async ({ request }) => {
    const resposta = await request.get("/api/health", { headers: ipDeTeste() });

    // 200 com tudo configurado; 503 quando falta env. No job `e2e` faltam as
    // de e-mail (Resend) de proposito -- o banco, que e o que importa aqui,
    // tem de responder nos dois casos.
    expect([200, 503]).toContain(resposta.status());
    const corpo = await resposta.json();
    expect(corpo).toEqual({
      status: resposta.status() === 200 ? "ok" : "fora",
      banco: true,
      envs: resposta.status() === 200,
    });
    expect(resposta.headers()["cache-control"]).toBe("no-store");
  });

  test("nao expoe quais variaveis de ambiente faltam", async ({ request }) => {
    const texto = await (await request.get("/api/health", { headers: ipDeTeste() })).text();

    // O monitor precisa de "banco ok / envs ok", nao do nome da chave -- o
    // nome ausente vai para o log do servidor, nunca para a resposta publica.
    expect(texto).not.toMatch(/RESEND_API_KEY|SERVICE_ROLE|SECRET/);
  });
});

test.describe("GET /api/app/versao-minima", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test("devolve a versao minima (ou null) com cache de borda curto", async ({ request }) => {
    const resposta = await request.get("/api/app/versao-minima", { headers: ipDeTeste() });

    expect(resposta.status()).toBe(200);
    const corpo = await resposta.json();
    expect(Object.keys(corpo)).toEqual(["minima"]);
    expect(corpo.minima === null || typeof corpo.minima === "string").toBe(true);
    expect(resposta.headers()["cache-control"]).toContain("s-maxage=300");
  });

  /**
   * O limite de taxa na rota de verdade, contra o contador do Postgres: 60 por
   * minuto por IP. A 61a chamada do mesmo IP e recusada com Retry-After, e um
   * IP diferente segue livre -- prova que o limite e por chamador, e nao global.
   */
  test("a 61a chamada do mesmo IP no minuto recebe 429 com Retry-After", async ({ request }) => {
    const mesmoIp = ipDeTeste();

    for (let i = 0; i < 60; i++) {
      const resposta = await request.get("/api/app/versao-minima", { headers: mesmoIp });
      expect(resposta.status(), `chamada ${i + 1}`).toBe(200);
    }

    const excedente = await request.get("/api/app/versao-minima", { headers: mesmoIp });
    expect(excedente.status()).toBe(429);
    expect(Number(excedente.headers()["retry-after"])).toBeGreaterThan(0);

    const outroIp = await request.get("/api/app/versao-minima", { headers: ipDeTeste() });
    expect(outroIp.status()).toBe(200);
  });
});
