import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { entrarComLogin, PARECE_EMAIL } from "./entrar-com-login";

const PORTAL = "https://portal.test/";
const TOKENS = { access_token: "acesso", refresh_token: "renovacao" };

function respostaJson(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

function authQueAceita() {
  return { setSession: vi.fn(async () => ({ data: {}, error: null })) } as never;
}

describe("PARECE_EMAIL", () => {
  it("separa e-mail de login do sistema antigo", () => {
    expect(PARECE_EMAIL.test("eric@servicos.test")).toBe(true);
    expect(PARECE_EMAIL.test("rodrigo.operacional00")).toBe(false);
    // Tem "@", mas sem dominio completo: e login.
    expect(PARECE_EMAIL.test("gilmar@servicos")).toBe(false);
  });
});

describe("entrarComLogin", () => {
  it("chama a rota do portal e guarda a sessao devolvida", async () => {
    const fetchImpl = respostaJson(200, TOKENS);
    const auth = authQueAceita() as { setSession: ReturnType<typeof vi.fn> };

    expect(await entrarComLogin(auth as never, PORTAL, "  rodrigo.op ", "segredo", fetchImpl)).toBe("ok");

    expect(fetchImpl).toHaveBeenCalledWith("https://portal.test/api/entrar-com-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "rodrigo.op", senha: "segredo" }),
    });
    expect(auth.setSession).toHaveBeenCalledWith(TOKENS);
  });

  it("401 e credencial recusada (conta tentativa)", async () => {
    expect(
      await entrarComLogin(authQueAceita(), PORTAL, "x", "y", respostaJson(401, { erro: "..." })),
    ).toBe("recusada");
  });

  it("sem rede e sem conexao, nao senha errada", async () => {
    const semRede = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await entrarComLogin(authQueAceita(), PORTAL, "x", "y", semRede)).toBe("sem-conexao");
  });

  it("portal ausente, erro do servidor ou resposta sem tokens e falha, nao recusa", async () => {
    const fetchImpl = respostaJson(200, TOKENS);
    expect(await entrarComLogin(authQueAceita(), undefined, "x", "y", fetchImpl)).toBe("falhou");
    expect(fetchImpl).not.toHaveBeenCalled();

    expect(await entrarComLogin(authQueAceita(), PORTAL, "x", "y", respostaJson(503, {}))).toBe("falhou");
    expect(await entrarComLogin(authQueAceita(), PORTAL, "x", "y", respostaJson(429, {}))).toBe("falhou");
    expect(await entrarComLogin(authQueAceita(), PORTAL, "x", "y", respostaJson(200, {}))).toBe("falhou");
  });

  it("setSession sem rede e sem conexao", async () => {
    const auth = {
      setSession: vi.fn(async () => ({ data: {}, error: new AuthRetryableFetchError("sem rede", 0) })),
    } as never;
    expect(await entrarComLogin(auth, PORTAL, "x", "y", respostaJson(200, TOKENS))).toBe("sem-conexao");
  });
});
