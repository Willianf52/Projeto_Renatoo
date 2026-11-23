import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `visitaDoDiaAberta`: o QR (ou o "Ver sites") no mesmo dia reabre a inspecao
 * que ainda nao foi finalizada, em vez de criar outra (26/10/2026; desde a
 * 0114, "nao finalizada" e nao "sem checklist"). SQLite, sincronizacao e
 * Supabase entram como dubles.
 */
const estado = vi.hoisted(() => ({
  sql: "",
  args: [] as unknown[],
  linha: null as { chave: string; visita_id: number | null } | null,
  finalizadasAqui: [] as { chave: string }[],
  falhasDaSincronizacao: [] as unknown[],
  sincronizou: 0,
  idDepoisDaSincronizacao: null as number | null,
  visita: { finalizada_em: null as string | null } as { finalizada_em: string | null } | null,
  erroDaConsulta: null as { message: string } | null,
  visitaConsultada: null as number | null,
  doServidor: [] as { id: number; numero_coleta: string }[],
  filtros: {} as Record<string, unknown>,
}));

vi.mock("./fila", () => ({
  abrirFila: async () => ({
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      estado.sql = sql;
      estado.args = args;
      return estado.linha;
    },
    getAllAsync: async () => estado.finalizadasAqui,
  }),
  idDaVisitaNoServidor: async () => estado.idDepoisDaSincronizacao,
}));

vi.mock("./sincronizacao", () => ({
  sincronizar: async () => {
    estado.sincronizou += 1;
    return { falhas: estado.falhasDaSincronizacao };
  },
}));

vi.mock("../lib/supabase", () => {
  // Construtor encadeavel: `maybeSingle` responde a conferencia da visita da
  // fila; `limit` responde a busca so no servidor.
  const construtor = () => {
    const c = {
      select: () => c,
      eq: (coluna: string, valor: unknown) => {
        estado.filtros[coluna] = valor;
        if (coluna === "id") estado.visitaConsultada = valor as number;
        return c;
      },
      gte: (coluna: string, valor: unknown) => {
        estado.filtros[`${coluna}>=`] = valor;
        return c;
      },
      is: (coluna: string, valor: unknown) => {
        estado.filtros[`${coluna} is`] = valor;
        return c;
      },
      order: () => c,
      maybeSingle: async () => ({ data: estado.visita, error: estado.erroDaConsulta }),
      limit: async () => ({ data: estado.doServidor, error: estado.erroDaConsulta }),
    };
    return c;
  };
  return { supabase: { from: () => construtor() } };
});

const { visitaDoDiaAberta } = await import("./visita-do-dia");

const HOJE = "2026-10-26T03:00:00.000Z";

beforeEach(() => {
  estado.sql = "";
  estado.args = [];
  estado.linha = null;
  estado.finalizadasAqui = [];
  estado.falhasDaSincronizacao = [];
  estado.sincronizou = 0;
  estado.idDepoisDaSincronizacao = null;
  estado.visita = { finalizada_em: null };
  estado.erroDaConsulta = null;
  estado.visitaConsultada = null;
  estado.doServidor = [];
  estado.filtros = {};
});

describe("visitaDoDiaAberta", () => {
  it("procura so a ultima visita de hoje, deste inspetor, neste site, sem Termino", async () => {
    await visitaDoDiaAberta(30, "inspetor-1", HOJE);
    expect(estado.args).toEqual([30, "inspetor-1", HOJE]);
    expect(estado.sql).toContain("l.termino = 1");
    expect(estado.sql).toContain("order by capturado_em desc");
  });

  it("visita da fila ja enviada e nao finalizada: reabre, sem sincronizar de novo", async () => {
    estado.linha = { chave: "chave-101", visita_id: 101 };
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toEqual({ visitaId: 101, numeroColeta: "chave-101" });
    expect(estado.sincronizou).toBe(0);
    expect(estado.visitaConsultada).toBe(101);
  });

  it("com checklist enviado e sem finalizar, continua aberta (0114)", async () => {
    estado.linha = { chave: "chave-104", visita_id: 104 };
    estado.visita = { finalizada_em: null };
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toEqual({ visitaId: 104, numeroColeta: "chave-104" });
  });

  it("finalizada no servidor: e uma inspecao nova", async () => {
    estado.linha = { chave: "chave-104", visita_id: 104 };
    estado.visita = { finalizada_em: "2026-10-26T15:00:00.000Z" };
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toBeNull();
  });

  it("visita lida sem sinal: sincroniza, e reabre pelo id do servidor", async () => {
    estado.linha = { chave: "chave-102", visita_id: null };
    estado.idDepoisDaSincronizacao = 102;
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toEqual({ visitaId: 102, numeroColeta: "chave-102" });
    expect(estado.sincronizou).toBe(1);
  });

  it("ainda sem sinal para sincronizar: null, sem travar o inspetor", async () => {
    estado.linha = { chave: "chave-102", visita_id: null };
    estado.falhasDaSincronizacao = [{ chave: "chave-102" }];
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toBeNull();
    expect(estado.visitaConsultada).toBeNull();
  });

  it("sem visita na fila: acha a aberta pelo Ver sites, so no servidor", async () => {
    estado.doServidor = [{ id: 120, numero_coleta: "uuid-120" }];
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toEqual({ visitaId: 120, numeroColeta: "uuid-120" });
    expect(estado.filtros).toMatchObject({ funcionario_id: "inspetor-1", site_id: 30, "criado_em>=": HOJE, "finalizada_em is": null });
  });

  it("a finalizada aqui e ainda nao enviada nao reabre pelo servidor", async () => {
    estado.finalizadasAqui = [{ chave: "uuid-120" }];
    estado.doServidor = [{ id: 120, numero_coleta: "uuid-120" }];
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toBeNull();
  });

  it("erro ao consultar: null, o caminho de sempre", async () => {
    estado.linha = { chave: "chave-102", visita_id: 102 };
    estado.visita = null;
    estado.erroDaConsulta = { message: "falhou" };
    expect(await visitaDoDiaAberta(30, "inspetor-1", HOJE)).toBeNull();
  });
});
