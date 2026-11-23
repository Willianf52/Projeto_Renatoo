import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("./fila", () => ({ abrirFila: async () => ({}) }));
vi.mock("./rascunho", () => ({ inicioDoDia: () => "" }));

const { dataEHoraDaInspecao, juntarPorSite } = await import("./inspecoes-em-andamento");

describe("inspecoes em andamento", () => {
  it("uma por site, a que comecou primeiro", () => {
    const mapa = juntarPorSite(
      [
        { siteId: 1, iniciadaEm: "2026-11-22T15:00:00.000Z", visitaId: null },
        { siteId: 1, iniciadaEm: "2026-11-22T12:00:00.000Z", visitaId: 10 },
        { siteId: 2, iniciadaEm: "2026-11-22T13:00:00.000Z", visitaId: null },
      ],
      new Set(),
    );
    expect(mapa.get(1)?.iniciadaEm).toBe("2026-11-22T12:00:00.000Z");
    expect(mapa.get(2)?.iniciadaEm).toBe("2026-11-22T13:00:00.000Z");
    expect(mapa.size).toBe(2);
  });

  it("visita que ja tem checklist enviado nao esta em andamento", () => {
    const mapa = juntarPorSite([{ siteId: 1, iniciadaEm: "2026-11-22T12:00:00.000Z", visitaId: 10 }], new Set([10]));
    expect(mapa.size).toBe(0);
  });

  it("data e hora no formato do app antigo", () => {
    const iso = new Date(2026, 10, 17, 17, 20, 54).toISOString();
    expect(dataEHoraDaInspecao(iso)).toBe("17/11/2026 17:20");
    expect(dataEHoraDaInspecao("xx")).toBe("");
  });
});
