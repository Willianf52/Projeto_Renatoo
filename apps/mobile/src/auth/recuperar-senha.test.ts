import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  chamadas: [] as { email: string; opcoes: unknown }[],
  resposta: { error: null } as { error: unknown },
  lanca: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  isAuthRetryableFetchError: (erro: unknown) => (erro as { rede?: boolean } | null)?.rede === true,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: async (email: string, opcoes: unknown) => {
        estado.chamadas.push({ email, opcoes });
        if (estado.lanca) throw new Error("Network request failed");
        return estado.resposta;
      },
    },
  },
}));

const { erroDoEmail, pedirNovaSenha } = await import("./recuperar-senha");

const PORTAL = "https://portal.exemplo";

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = { error: null };
  estado.lanca = false;
});

describe("erroDoEmail", () => {
  it("vazio e invalido sao recusados antes da rede", () => {
    expect(erroDoEmail("  ")).toMatch(/Informe/);
    expect(erroDoEmail("fulano")).toMatch(/inválido/);
    expect(erroDoEmail(" a@b.com ")).toBeNull();
  });
});

describe("pedirNovaSenha", () => {
  it("manda o link para a pagina de nova senha do portal, com o e-mail normalizado", async () => {
    expect(await pedirNovaSenha(" Fulano@Empresa.com ", PORTAL)).toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { email: "fulano@empresa.com", opcoes: { redirectTo: `${PORTAL}/auth/sessao?next=/nova-senha` } },
    ]);
  });

  it("sem o endereco do portal, deixa o Supabase usar a Site URL", async () => {
    await pedirNovaSenha("a@b.com", undefined);
    expect(estado.chamadas[0].opcoes).toEqual({ redirectTo: undefined });
  });

  it("e-mail invalido nem chega ao Supabase", async () => {
    expect((await pedirNovaSenha("fulano", PORTAL)).ok).toBe(false);
    expect(estado.chamadas).toEqual([]);
  });

  it("erro que nao e de rede responde igual ao sucesso, para nao revelar quem tem conta", async () => {
    estado.resposta = { error: { status: 429, message: "email rate limit exceeded" } };
    expect(await pedirNovaSenha("a@b.com", PORTAL)).toEqual({ ok: true });
  });

  it("limite de envio do projeto avisa; o limite por usuario nao, para nao revelar a conta", async () => {
    estado.resposta = { error: { status: 429, code: "over_email_send_rate_limit" } };
    expect(await pedirNovaSenha("a@b.com", PORTAL)).toMatchObject({ ok: false, erro: expect.stringMatching(/Muitos pedidos/) });

    estado.resposta = { error: { status: 429, code: "over_request_rate_limit" } };
    expect(await pedirNovaSenha("a@b.com", PORTAL)).toEqual({ ok: true });
  });

  it("sem rede, avisa", async () => {
    estado.resposta = { error: { rede: true } };
    expect(await pedirNovaSenha("a@b.com", PORTAL)).toMatchObject({ ok: false, erro: expect.stringMatching(/Sem conexão/) });

    estado.lanca = true;
    expect(await pedirNovaSenha("a@b.com", PORTAL)).toMatchObject({ ok: false, erro: expect.stringMatching(/Sem conexão/) });
  });
});
