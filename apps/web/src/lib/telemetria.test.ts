import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock } = vi.hoisted(() => ({
  insertMock: vi.fn(async () => ({ error: null as { message: string } | null })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ insert: insertMock }) }),
}));

const { nomesDosFiltros, registrarEvento, rotaNormalizada } = await import("./telemetria");

beforeEach(() => {
  insertMock.mockClear();
});

describe("nomesDosFiltros", () => {
  it("devolve so os nomes preenchidos, sem os valores, em ordem", () => {
    expect(nomesDosFiltros("?site=12&data_inicial=2026-09-01&funcionario=")).toEqual([
      "data_inicial",
      "site",
    ]);
  });

  it("ignora a paginacao e campo so com espaco", () => {
    expect(nomesDosFiltros("?pagina=3&busca=%20%20")).toEqual([]);
  });
});

describe("rotaNormalizada", () => {
  it("troca id numerico e uuid por :id", () => {
    expect(rotaNormalizada("/dashboard/cadastros/qr-code/12/editar")).toBe(
      "/dashboard/cadastros/qr-code/:id/editar",
    );
    expect(
      rotaNormalizada("/dashboard/cadastros/usuarios/d0000000-0000-0000-0000-000000000001/editar"),
    ).toBe("/dashboard/cadastros/usuarios/:id/editar");
  });

  it("nao mexe em segmento de texto", () => {
    expect(rotaNormalizada("/dashboard/inspecoes/relatorios/registro-de-rondas")).toBe(
      "/dashboard/inspecoes/relatorios/registro-de-rondas",
    );
  });
});

describe("registrarEvento", () => {
  it("insere so evento e detalhes -- o autor e o banco que carimba", async () => {
    registrarEvento("tela_aberta", { rota: "/dashboard", filtros: ["site"] });

    expect(insertMock).toHaveBeenCalledWith({
      evento: "tela_aberta",
      detalhes: { rota: "/dashboard", filtros: ["site"] },
    });
  });

  it("falha do insert nao lanca: vira aviso", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({ error: { message: "rede" } });

    expect(() => registrarEvento("login")).not.toThrow();
    await vi.waitFor(() => expect(aviso).toHaveBeenCalled());

    aviso.mockRestore();
  });
});
