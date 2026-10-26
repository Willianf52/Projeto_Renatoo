import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `visitaDoDiaSemChecklist`: o QR lido de novo no mesmo dia reabre a visita
 * que ficou sem checklist (a lida sem sinal), em vez de criar outra (26/10/2026).
 * SQLite, sincronizacao e Supabase entram como dubles: o que se confere e a
 * consulta, a ordem (sincroniza antes de conferir) e a decisao.
 */
const estado = vi.hoisted(() => ({
  sql: "",
  args: [] as unknown[],
  linha: null as { chave: string; visita_id: number | null } | null,
  falhasDaSincronizacao: [] as unknown[],
  sincronizou: 0,
  idDepoisDaSincronizacao: null as number | null,
  checklists: [] as { id: number }[] | null,
  erroDaConsulta: null as { message: string } | null,
  visitaConsultada: null as number | null,
}));

vi.mock("./fila", () => ({
  abrirFila: async () => ({
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      estado.sql = sql;
      estado.args = args;
      return estado.linha;
    },
  }),
  idDaVisitaNoServidor: async () => estado.idDepoisDaSincronizacao,
}));

vi.mock("./sincronizacao", () => ({
  sincronizar: async () => {
    estado.sincronizou += 1;
    return { falhas: estado.falhasDaSincronizacao };
  },
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_coluna: string, visitaId: number) => {
          estado.visitaConsultada = visitaId;
          return {
            limit: async () => ({ data: estado.checklists, error: estado.erroDaConsulta }),
          };
        },
      }),
    }),
  },
}));

const { visitaDoDiaSemChecklist } = await import("./visita-do-dia");

const HOJE = "2026-10-26T03:00:00.000Z";

beforeEach(() => {
  estado.sql = "";
  estado.args = [];
  estado.linha = null;
  estado.falhasDaSincronizacao = [];
  estado.sincronizou = 0;
  estado.idDepoisDaSincronizacao = null;
  estado.checklists = [];
  estado.erroDaConsulta = null;
  estado.visitaConsultada = null;
});

describe("visitaDoDiaSemChecklist", () => {
  it("procura so a ultima visita de hoje, deste inspetor, neste site", async () => {
    await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE);

    expect(estado.args).toEqual([30, "inspetor-1", HOJE]);
    expect(estado.sql).toContain("capturado_em >= ?");
    expect(estado.sql).toContain("order by capturado_em desc");
    expect(estado.sql).toContain("limit 1");
  });

  it("sem visita hoje, devolve null e o QR segue o caminho de sempre", async () => {
    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toBeNull();
  });

  it("visita ja enviada e sem checklist: reabre ela, sem sincronizar de novo", async () => {
    estado.linha = { chave: "chave-102", visita_id: 102 };

    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toEqual({
      visitaId: 102,
      numeroColeta: "chave-102",
    });
    expect(estado.sincronizou).toBe(0);
    expect(estado.visitaConsultada).toBe(102);
  });

  it("visita lida sem sinal: sincroniza, e reabre pelo id do servidor", async () => {
    estado.linha = { chave: "chave-nova", visita_id: null };
    estado.idDepoisDaSincronizacao = 105;

    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toEqual({
      visitaId: 105,
      numeroColeta: "chave-nova",
    });
    expect(estado.sincronizou).toBe(1);
  });

  it("ainda sem sinal para sincronizar: null, sem travar o inspetor", async () => {
    estado.linha = { chave: "chave-nova", visita_id: null };
    estado.falhasDaSincronizacao = [{ erro: "sem rede" }];

    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toBeNull();
    expect(estado.visitaConsultada).toBeNull();
  });

  it("a ultima visita do dia ja tem checklist: e uma inspecao nova", async () => {
    estado.linha = { chave: "chave-104", visita_id: 104 };
    estado.checklists = [{ id: 38 }];

    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toBeNull();
  });

  it("erro ao consultar o checklist: null, o caminho de sempre", async () => {
    estado.linha = { chave: "chave-102", visita_id: 102 };
    estado.checklists = null;
    estado.erroDaConsulta = { message: "falhou" };

    expect(await visitaDoDiaSemChecklist(30, "inspetor-1", HOJE)).toBeNull();
  });
});
