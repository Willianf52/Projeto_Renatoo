import { describe, expect, it, vi } from "vitest";
import { pedirLinkDoPdf } from "./link-do-pdf";

const PORTAL = "https://portal.exemplo.com.br";

function resposta(status: number, corpo: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
}

describe("pedirLinkDoPdf", () => {
  it("pede o link com o token do app e devolve o endereco do portal", async () => {
    const fetchImpl = resposta(200, { url: `${PORTAL}/api/app/pdf/42.1.abc` });
    const resultado = await pedirLinkDoPdf(`${PORTAL}/`, 42, "token-do-app", fetchImpl);

    expect(resultado).toEqual({ ok: true, url: `${PORTAL}/api/app/pdf/42.1.abc` });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${PORTAL}/api/app/checklists/42/link-do-pdf`,
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer token-do-app" } }),
    );
  });

  it("sem portal configurado ou sem sessao, nem chama a rede", async () => {
    const fetchImpl = resposta(200);
    expect((await pedirLinkDoPdf(undefined, 42, "t", fetchImpl)).ok).toBe(false);
    expect(await pedirLinkDoPdf(PORTAL, 42, null, fetchImpl)).toEqual({
      ok: false,
      erro: "Sua sessão expirou. Entre de novo no app.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("traduz as respostas do portal", async () => {
    expect(await pedirLinkDoPdf(PORTAL, 42, "t", resposta(401))).toMatchObject({ erro: expect.stringContaining("sessão") });
    expect(await pedirLinkDoPdf(PORTAL, 42, "t", resposta(404))).toMatchObject({ erro: expect.stringContaining("não foi encontrado") });
    expect(await pedirLinkDoPdf(PORTAL, 42, "t", resposta(429))).toMatchObject({ erro: expect.stringContaining("Aguarde") });
    expect(await pedirLinkDoPdf(PORTAL, 42, "t", resposta(500))).toMatchObject({ ok: false });
  });

  it("recusa link que nao seja do proprio portal", async () => {
    const resultado = await pedirLinkDoPdf(PORTAL, 42, "t", resposta(200, { url: "https://outro.site/arquivo.pdf" }));
    expect(resultado.ok).toBe(false);
  });

  it("sem internet, avisa para tentar de novo", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await pedirLinkDoPdf(PORTAL, 42, "t", fetchImpl)).toMatchObject({ erro: expect.stringContaining("internet") });
  });
});
