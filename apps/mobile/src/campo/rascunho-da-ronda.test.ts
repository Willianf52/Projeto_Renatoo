import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `rascunhoDeRondaDoSite`: o checklist comecado numa ronda (QR) precisa voltar
 * pelo "Ver sites" depois de o app ser reaberto (teste no tablet, 13/10/2026).
 * O SQLite entra como duble: o que se confere e a consulta (recorte por
 * inspetor e site, so rascunho com conteudo, so visita da fila) e o que volta.
 */
const banco = vi.hoisted(() => ({
  sql: "",
  args: [] as unknown[],
  linha: null as { visita_id: number; chave: string } | null,
}));

vi.mock("./fila", () => ({
  abrirFila: async () => ({
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      banco.sql = sql;
      banco.args = args;
      return banco.linha;
    },
  }),
}));
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: {} }));

const { inicioDoDia, rascunhoDeRondaDoSite } = await import("./rascunho");

beforeEach(() => {
  banco.sql = "";
  banco.args = [];
  banco.linha = null;
});

describe("rascunhoDeRondaDoSite", () => {
  it("devolve a visita e o numero da coleta da ronda", async () => {
    banco.linha = { visita_id: 92, chave: "0c947992-d44b-4d9f-af30-ef1c54cd77b9" };

    expect(await rascunhoDeRondaDoSite(30, "inspetor-1")).toEqual({
      visitaId: 92,
      numeroColeta: "0c947992-d44b-4d9f-af30-ef1c54cd77b9",
    });
  });

  it("recorta pelo inspetor da sessao e pelo site", async () => {
    await rascunhoDeRondaDoSite(30, "inspetor-1");

    expect(banco.args).toEqual(["inspetor-1", 30]);
    expect(banco.sql).toContain("r.funcionario_id = ?");
    expect(banco.sql).toContain("v.site_id = ?");
  });

  // Decisao do dono (23/10/2026): pelo QR, so o checklist comecado hoje.
  it("com comecadoDesde, so visita cujo QR foi lido a partir dali", async () => {
    await rascunhoDeRondaDoSite(30, "inspetor-1", "2026-10-23T03:00:00.000Z");

    expect(banco.sql).toContain("v.capturado_em >= ?");
    expect(banco.args).toEqual(["inspetor-1", 30, "2026-10-23T03:00:00.000Z"]);
  });

  it("sem comecadoDesde (Ver sites), qualquer data", async () => {
    await rascunhoDeRondaDoSite(30, "inspetor-1");

    expect(banco.sql).not.toContain("capturado_em");
  });

  it("inicioDoDia: meia-noite local, no formato do capturado_em", () => {
    const agora = new Date(2026, 9, 23, 10, 15, 0);

    expect(inicioDoDia(agora)).toBe(new Date(2026, 9, 23, 0, 0, 0).toISOString());
  });

  it("so considera rascunho de visita (chave positiva) e com algo preenchido", async () => {
    await rascunhoDeRondaDoSite(30, "inspetor-1");

    expect(banco.sql).toContain("r.visita_id > 0");
    expect(banco.sql).toContain("r.respostas <> '{}'");
    expect(banco.sql).toContain("order by r.atualizado_em desc");
  });

  it("sem rascunho de ronda, devolve null e o Ver sites abre um checklist novo", async () => {
    expect(await rascunhoDeRondaDoSite(30, "inspetor-1")).toBeNull();
  });
});
