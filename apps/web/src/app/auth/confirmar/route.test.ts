import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  chamadas: [] as unknown[],
  erro: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: async (params: unknown) => {
        estado.chamadas.push(params);
        return { error: estado.erro };
      },
    },
  }),
}));

const { GET } = await import("./route");

const BASE = "https://portal.exemplo";

function abrir(query: string) {
  return GET(new NextRequest(`${BASE}/auth/confirmar?${query}`));
}

beforeEach(() => {
  estado.chamadas = [];
  estado.erro = null;
});

describe("/auth/confirmar", () => {
  it("verifica o token_hash e leva para o destino pedido", async () => {
    const resposta = await abrir("token_hash=abc&type=recovery&next=/nova-senha");

    expect(estado.chamadas).toEqual([{ type: "recovery", token_hash: "abc" }]);
    expect(resposta.headers.get("location")).toBe(`${BASE}/nova-senha`);
  });

  it("recuperacao sem next vai para a nova senha", async () => {
    const resposta = await abrir("token_hash=abc&type=recovery");
    expect(resposta.headers.get("location")).toBe(`${BASE}/nova-senha`);
  });

  it("destino externo e trocado pelo padrao", async () => {
    const resposta = await abrir("token_hash=abc&type=invite&next=//site-falso.com");
    expect(resposta.headers.get("location")).toBe(`${BASE}/dashboard`);
  });

  it("token recusado, tipo desconhecido ou faltando volta ao login com aviso", async () => {
    estado.erro = { message: "Token has expired or is invalid" };
    expect((await abrir("token_hash=abc&type=recovery")).headers.get("location")).toBe(`${BASE}/?erro=link-invalido`);

    estado.erro = null;
    expect((await abrir("token_hash=abc&type=qualquer")).headers.get("location")).toBe(`${BASE}/?erro=link-invalido`);
    expect((await abrir("type=recovery")).headers.get("location")).toBe(`${BASE}/?erro=link-invalido`);
    expect(estado.chamadas).toHaveLength(1);
  });
});
