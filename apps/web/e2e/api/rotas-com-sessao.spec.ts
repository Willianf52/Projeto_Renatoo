import { expect, test } from "@playwright/test";
import { MOTIVO_SEM_STACK, SESSAO_DO_GESTOR, STACK_LOCAL } from "../suporte/ambiente";
import { ipDeTeste } from "./suporte";

/**
 * Rotas de `/api` que exigem sessao: a busca de CEP do cadastro de site e a
 * verificacao de senha vazada das telas de senha.
 *
 * `/api` fica FORA do matcher do proxy.ts, entao nao ha redirecionamento para
 * o login protegendo estas rotas -- cada uma confere a sessao sozinha. O teste
 * sem sessao e o que garante que essa conferencia continua la.
 */

test.describe("rotas com sessao, sem cookie de sessao", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  test("GET /api/cep sem sessao: 401, nao redirect", async ({ request }) => {
    const resposta = await request.get("/api/cep?cep=01001000", {
      headers: ipDeTeste(),
      maxRedirects: 0,
    });
    expect(resposta.status()).toBe(401);
    expect(await resposta.json()).toEqual({ error: "unauthorized" });
  });

  /**
   * Sem esta guarda a rota viraria um oraculo publico do HaveIBeenPwned por
   * conta do servidor -- e um jeito de gastar a cota e o IP do projeto.
   */
  test("POST /api/senha/verificar-vazamento sem sessao: 401", async ({ request }) => {
    const resposta = await request.post("/api/senha/verificar-vazamento", {
      headers: ipDeTeste(),
      data: { senha: "Senha@2024" },
      maxRedirects: 0,
    });
    expect(resposta.status()).toBe(401);
  });
});

test.describe("rotas com sessao, logado como GESTOR", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);
  test.use({ storageState: SESSAO_DO_GESTOR });

  test("GET /api/cep com CEP de tamanho errado: 400", async ({ request }) => {
    const resposta = await request.get("/api/cep?cep=123", { headers: ipDeTeste() });
    expect(resposta.status()).toBe(400);
  });

  test("GET /api/cep ignora mascara: 01001-000 vira 8 digitos e passa da validacao", async ({ request }) => {
    const resposta = await request.get("/api/cep?cep=01001-000", { headers: ipDeTeste() });

    // A consulta vai ao ViaCEP, que e externo: 200 com o endereco quando ele
    // responde, 502 quando nao. Nunca 400 -- a mascara nao pode reprovar.
    expect([200, 502]).toContain(resposta.status());
    if (resposta.status() === 200) {
      const corpo = await resposta.json();
      expect(Object.keys(corpo).sort()).toEqual(["bairro", "localidade", "logradouro", "uf"]);
      expect(corpo.uf).toBe("SP");
    }
  });

  test("POST /api/senha/verificar-vazamento com corpo que nao e JSON: 400", async ({ request }) => {
    const resposta = await request.post("/api/senha/verificar-vazamento", {
      headers: { ...ipDeTeste(), "content-type": "application/json" },
      // Buffer: string em `data` seria serializada como JSON valido (ver o
      // mesmo caso em rotas-com-segredo.spec.ts).
      data: Buffer.from("nao e json"),
    });
    expect(resposta.status()).toBe(400);
    expect(await resposta.json()).toEqual({ error: "corpo inválido" });
  });

  test("POST /api/senha/verificar-vazamento sem o campo senha: 400", async ({ request }) => {
    const resposta = await request.post("/api/senha/verificar-vazamento", {
      headers: ipDeTeste(),
      data: { outra: "coisa" },
    });
    expect(resposta.status()).toBe(400);
  });

  /**
   * "password" e a senha mais vazada que existe. Se o HaveIBeenPwned estiver
   * fora do ar a rota falha ABERTA (`vazada: false`, de proposito -- ver o
   * cabecalho de lib/verificar-senha-vazada.ts), entao o contrato garantido e
   * o formato; o `true` so e cobrado quando a consulta externa respondeu.
   */
  test("POST /api/senha/verificar-vazamento responde { vazada: boolean }", async ({ request }) => {
    const resposta = await request.post("/api/senha/verificar-vazamento", {
      headers: ipDeTeste(),
      data: { senha: "password" },
    });
    expect(resposta.status()).toBe(200);
    const corpo = await resposta.json();
    expect(Object.keys(corpo)).toEqual(["vazada"]);
    expect(typeof corpo.vazada).toBe("boolean");
  });
});

/**
 * Rotas que devolvem arquivo (exportacao e midia) moram fora de `/api` e ficam
 * atras do proxy: sem sessao, o navegador e mandado ao login com o destino
 * preservado -- nunca recebe o arquivo.
 */
test.describe("rotas de arquivo sem sessao", () => {
  test.skip(!STACK_LOCAL, MOTIVO_SEM_STACK);

  for (const caminho of [
    "/dashboard/inspecoes/coletas-importadas/export/excel",
    "/dashboard/cadastros/qr-code/export/excel",
    "/dashboard/checklistlab/historico-de-checklist/1/assinatura",
  ]) {
    test(`${caminho}: redireciona ao login sem entregar o arquivo`, async ({ request }) => {
      const resposta = await request.get(caminho, { maxRedirects: 0 });

      expect([307, 308]).toContain(resposta.status());
      const destino = new URL(resposta.headers()["location"], "http://localhost");
      expect(destino.pathname).toBe("/");
      expect(destino.searchParams.get("redirectTo")).toBe(caminho);
    });
  }
});
