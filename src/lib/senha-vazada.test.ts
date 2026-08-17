import { afterEach, describe, expect, it, vi } from "vitest";
import { senhaVazada } from "./senha-vazada";

/**
 * `senhaVazada` sempre computa o SHA-1 real da senha -- os testes não podem
 * escolher o prefixo/sufixo. Por isso cada caso usa uma senha cujo hash foi
 * calculado previamente (comentado ao lado) em vez de tentar adivinhar um
 * valor conveniente.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("senhaVazada", () => {
  it("reconhece um sufixo presente na resposta do HIBP", async () => {
    // sha1("Senha123!") = CAEA3241502AE34EE662FE128D5D0B8B1F70C376
    // prefixo: CAEA3, sufixo: 241502AE34EE662FE128D5D0B8B1F70C376
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.pwnedpasswords.com/range/CAEA3");
      return new Response(
        "241502AE34EE662FE128D5D0B8B1F70C376:3\r\nOUTRO0000000000000000000000000000:1",
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await senhaVazada("Senha123!")).toBe(true);
  });

  it("nao reconhece um sufixo ausente na resposta", async () => {
    const fetchMock = vi.fn(async () => new Response("OUTRO0000000000000000000000000000:1", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await senhaVazada("Senha123!")).toBe(false);
  });

  it("nao bloqueia quando a API responde com erro", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await senhaVazada("Senha123!")).toBe(false);
  });

  it("nao bloqueia quando a rede falha", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await senhaVazada("Senha123!")).toBe(false);
  });
});
