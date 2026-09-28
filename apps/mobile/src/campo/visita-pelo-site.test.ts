import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  inseridas: [] as unknown[],
  resposta: { data: { id: 90 }, error: null } as { data: { id: number } | null; error: { code: string } | null },
  lanca: false,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e" }));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      insert: (linha: unknown) => {
        estado.inseridas.push(linha);
        return {
          select: () => ({
            single: async () => {
              if (estado.lanca) throw new Error("Network request failed");
              return estado.resposta;
            },
          }),
        };
      },
    }),
  },
}));

const { abrirVisitaPeloSite, motivoParaNaoAbrir } = await import("./visita-pelo-site");

const SITE = { id: 30, nome: "Posto Central", ativo: true, recebeVisita: true };

beforeEach(() => {
  estado.inseridas = [];
  estado.resposta = { data: { id: 90 }, error: null };
  estado.lanca = false;
});

describe("motivoParaNaoAbrir", () => {
  it("site ativo que recebe visita pode", () => {
    expect(motivoParaNaoAbrir(SITE)).toBeNull();
  });

  it("site inativo ou que nao recebe visita nao pode", () => {
    expect(motivoParaNaoAbrir({ ...SITE, ativo: false })).toMatch(/inativo/);
    expect(motivoParaNaoAbrir({ ...SITE, recebeVisita: false })).toMatch(/não receber visitas/);
  });
});

describe("abrirVisitaPeloSite", () => {
  it("cria a visita em nome de quem esta logado, com UUID como numero de coleta", async () => {
    const resultado = await abrirVisitaPeloSite(SITE, "u1");

    expect(estado.inseridas).toEqual([
      { numero_coleta: "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e", site_id: 30, funcionario_id: "u1" },
    ]);
    expect(resultado).toEqual({ ok: true, visitaId: 90, numeroColeta: "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e" });
  });

  it("site que nao pode receber visita nem chega ao banco", async () => {
    const resultado = await abrirVisitaPeloSite({ ...SITE, ativo: false }, "u1");

    expect(resultado.ok).toBe(false);
    expect(estado.inseridas).toEqual([]);
  });

  it("recusa do RLS vira mensagem de permissao", async () => {
    estado.resposta = { data: null, error: { code: "42501" } };
    expect(await abrirVisitaPeloSite(SITE, "u1")).toEqual({ ok: false, erro: "Sua conta não pode registrar visitas." });
  });

  it("sem rede, avisa que o checklist precisa de internet", async () => {
    estado.lanca = true;
    expect(await abrirVisitaPeloSite(SITE, "u1")).toMatchObject({ ok: false, erro: expect.stringMatching(/Sem conexão/) });
  });
});
