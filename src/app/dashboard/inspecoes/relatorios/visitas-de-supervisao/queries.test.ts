import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { metodo: string; args: unknown[] };

/** Uma tabela mockada por `.from(tabela)`, cada uma com sua propria resposta
 * e lista de chamadas -- a query real faz `leituras` e `metas_visitas` em
 * paralelo (Promise.all), entao um mock generico de tabela unica nao serve. */
const { createClientMock, respostas, chamadasPorTabela } = vi.hoisted(() => {
  const respostas = new Map<string, { data: unknown; error: null }>();
  const chamadasPorTabela = new Map<string, Chamada[]>();

  const createClientMock = vi.fn(async () => ({
    from(tabela: string) {
      const chamadas: Chamada[] = chamadasPorTabela.get(tabela) ?? [];
      chamadasPorTabela.set(tabela, chamadas);

      const chain: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "gte", "lt", "order"]) {
        chain[metodo] = (...args: unknown[]) => {
          chamadas.push({ metodo, args });
          return chain;
        };
      }
      chain.maybeSingle = (...args: unknown[]) => {
        chamadas.push({ metodo: "maybeSingle", args });
        return Promise.resolve(respostas.get(tabela) ?? { data: null, error: null });
      };
      chain.then = (resolve: (resultado: { data: unknown; error: null }) => void) =>
        resolve(respostas.get(tabela) ?? { data: [], error: null });

      return chain;
    },
  }));

  return { createClientMock, respostas, chamadasPorTabela };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { extrairFiltros, getHistoricoDeSupervisao, getOpcoesSites } = await import("./queries");

beforeEach(() => {
  respostas.clear();
  chamadasPorTabela.clear();
});

function leitura(
  visitaId: number,
  dataHora: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: Math.random(),
    data_hora: dataHora,
    tem_localizacao: false,
    observacao: null,
    visitas: {
      id: visitaId,
      profiles: { nome_completo: "Odair Viana Lima" },
      motivos_visita: { nome: "Inspeção" },
      sites: { nome: "ACE Limpeza" },
    },
    ...extra,
  };
}

describe("extrairFiltros", () => {
  it("le mes e site da querystring", () => {
    expect(extrairFiltros({ mes: "2026-08", site: "7" })).toEqual({ mes: "2026-08", site: "7" });
  });

  it("cai no mes atual para valor ausente ou fora do formato yyyy-mm", () => {
    const mesAtual = extrairFiltros({}).mes;
    expect(mesAtual).toMatch(/^\d{4}-\d{2}$/);
    expect(extrairFiltros({ mes: "agosto/2026" }).mes).toBe(mesAtual);
    expect(extrairFiltros({ mes: "2026-13" }).mes).toBe(mesAtual);
  });

  it("site fica ausente quando nao vem na querystring", () => {
    expect(extrairFiltros({}).site).toBeUndefined();
  });
});

describe("getOpcoesSites", () => {
  it("prefixa com o grupo quando o site tem um", async () => {
    respostas.set("sites", {
      data: [
        { id: 1, nome: "ACE Limpeza", grupos_sites: { nome: "UP Serviços" } },
        { id: 2, nome: "Sem Grupo", grupos_sites: null },
      ],
      error: null,
    });

    const opcoes = await getOpcoesSites();

    expect(opcoes).toEqual([
      { value: "1", label: "UP Serviços - ACE Limpeza" },
      { value: "2", label: "Sem Grupo" },
    ]);
  });
});

describe("getHistoricoDeSupervisao", () => {
  it("agrupa leituras da mesma visita numa linha so, usando a leitura mais antiga como Data/Hora", async () => {
    respostas.set("leituras", {
      data: [
        leitura(10, "2026-08-08T12:45:00Z"), // Termino
        leitura(10, "2026-08-08T09:45:00Z"), // Inicio -- mais antiga, vence
        leitura(11, "2026-08-04T12:40:00Z"),
      ],
      error: null,
    });

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.realizado).toBe(2);
    expect(historico.visitas).toHaveLength(2);
    expect(historico.visitas.find((v) => v.visitaId === 10)?.dataHora).toBe("2026-08-08T09:45:00Z");
  });

  it("localizacao e observacao vem de qualquer leitura da visita, nao so a mais antiga", async () => {
    respostas.set("leituras", {
      data: [
        leitura(20, "2026-08-08T09:00:00Z", { tem_localizacao: false, observacao: null }),
        leitura(20, "2026-08-08T09:30:00Z", { tem_localizacao: true, observacao: "Portão trancado" }),
      ],
      error: null,
    });

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.visitas[0].temLocalizacao).toBe(true);
    expect(historico.visitas[0].observacao).toBe("Portão trancado");
  });

  it("meta nula (sem linha em metas_visitas, ou usuario sem acesso a ela) vira null, nao erro", async () => {
    respostas.set("leituras", { data: [leitura(30, "2026-08-08T09:45:00Z")], error: null });
    // metas_visitas sem resposta configurada -> maybeSingle devolve data: null.

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.meta).toBeNull();
    expect(historico.realizado).toBe(1);
  });

  it("meta presente vem de metas_visitas.quantidade_esperada", async () => {
    respostas.set("leituras", { data: [], error: null });
    respostas.set("metas_visitas", { data: { quantidade_esperada: 5 }, error: null });

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.meta).toBe(5);
    expect(historico.realizado).toBe(0);
  });

  it("filtra leituras pelo site (via visitas!inner) e pelo intervalo do mes", async () => {
    respostas.set("leituras", { data: [], error: null });

    await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    const chamadas = chamadasPorTabela.get("leituras") ?? [];
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["visitas.site_id", "3"] });

    const gte = chamadas.find((c) => c.metodo === "gte");
    const lt = chamadas.find((c) => c.metodo === "lt");
    expect(gte?.args[0]).toBe("data_hora");
    expect(String(gte?.args[1])).toMatch(/^2026-08-01/);
    expect(lt?.args[0]).toBe("data_hora");
    expect(String(lt?.args[1])).toMatch(/^2026-09-01/);
  });

  it("consulta metas_visitas pelo site e pelo primeiro dia do mes (competencia)", async () => {
    respostas.set("leituras", { data: [], error: null });

    await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    const chamadas = chamadasPorTabela.get("metas_visitas") ?? [];
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["site_id", "3"] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["competencia", "2026-08-01"] });
  });
});
