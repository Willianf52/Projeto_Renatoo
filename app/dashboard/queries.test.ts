import { beforeEach, describe, expect, it, vi } from "vitest";

type Resposta = { data: unknown; count?: number | null; error: null };

const { createClientMock, respostas, chamadas } = vi.hoisted(() => {
  const respostas = new Map<string, Resposta>();
  const chamadas: Array<{ tabela: string; metodo: string; args: unknown[] }> = [];

  const createClientMock = vi.fn(async () => ({
    from(tabela: string) {
      const resposta = () => respostas.get(tabela) ?? { data: [], count: 0, error: null };

      const chain: Record<string, unknown> = {};
      for (const metodo of ["select", "order", "eq"]) {
        chain[metodo] = (...args: unknown[]) => {
          chamadas.push({ tabela, metodo, args });
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(resposta());
      chain.then = (resolve: (r: Resposta) => void) => resolve(resposta());
      return chain;
    },
  }));

  return { createClientMock, respostas, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { getMetasDoMes, getResumoDoMes, getTotaisDeCadastro, rotuloDoMes, totalizarMetas } =
  await import("./queries");

beforeEach(() => {
  respostas.clear();
  chamadas.length = 0;
});

describe("getResumoDoMes", () => {
  it("lê a view de totais, sem agregar no TS", async () => {
    // A agregacao mora na migration 0017: contar visitas por site a partir do
    // PostgREST exigiria trazer as linhas para contar em memoria.
    respostas.set("resumo_operacional_do_mes", {
      data: { visitas: 12, leituras: 24, sites_visitados: 5 },
      error: null,
    });

    expect(await getResumoDoMes()).toEqual({ visitas: 12, leituras: 24, sitesVisitados: 5 });
    expect(chamadas.some((c) => c.tabela === "resumo_operacional_do_mes")).toBe(true);
  });

  it("devolve zeros quando o RLS não alcança nada", async () => {
    // A view agrega sem `group by` e sempre teria uma linha -- mas `maybeSingle`
    // volta null se a policy recusar tudo, e a faixa de indicadores não pode
    // quebrar por causa disso.
    respostas.set("resumo_operacional_do_mes", { data: null, error: null });

    expect(await getResumoDoMes()).toEqual({ visitas: 0, leituras: 0, sitesVisitados: 0 });
  });

  it("converte bigint em número", async () => {
    // `count(...)::bigint` chega como string no cliente do Postgres.
    respostas.set("resumo_operacional_do_mes", {
      data: { visitas: "7", leituras: "14", sites_visitados: "3" },
      error: null,
    });

    expect(await getResumoDoMes()).toEqual({ visitas: 7, leituras: 14, sitesVisitados: 3 });
  });
});

describe("getMetasDoMes", () => {
  const linha = (site: string, esperadas: number, realizadas: number, siteId = 1) => ({
    site_id: siteId,
    site,
    grupo: "Cooplivre",
    esperadas,
    realizadas,
  });

  it("ordena pelo pior desempenho primeiro", async () => {
    // O grafico existe para achar o site que ficou para tras; enterra-lo no fim
    // da lista seria enterrar a unica informacao acionavel.
    respostas.set("resumo_metas_do_mes", {
      data: [linha("Cheio", 10, 10, 1), linha("Vazio", 10, 2, 2), linha("Meio", 10, 5, 3)],
      error: null,
    });

    const metas = await getMetasDoMes();

    expect(metas.map((m) => m.site)).toEqual(["Vazio", "Meio", "Cheio"]);
  });

  it("compara razão, e não valor absoluto", async () => {
    // 5 de 100 e pior que 9 de 10, ainda que 5 seja menos que 9 em absoluto.
    respostas.set("resumo_metas_do_mes", {
      data: [linha("Pequeno", 10, 9, 1), linha("Grande", 100, 5, 2)],
      error: null,
    });

    expect((await getMetasDoMes()).map((m) => m.site)).toEqual(["Grande", "Pequeno"]);
  });

  it("desempata por nome, para a ordem não variar entre recargas", async () => {
    respostas.set("resumo_metas_do_mes", {
      data: [linha("Zulu", 10, 5, 1), linha("Alfa", 10, 5, 2)],
      error: null,
    });

    expect((await getMetasDoMes()).map((m) => m.site)).toEqual(["Alfa", "Zulu"]);
  });

  it("trata meta zero como cumprida, em vez de dividir por zero", async () => {
    respostas.set("resumo_metas_do_mes", {
      data: [linha("Sem meta", 0, 0, 1), linha("Atrasado", 10, 1, 2)],
      error: null,
    });

    expect((await getMetasDoMes()).map((m) => m.site)).toEqual(["Atrasado", "Sem meta"]);
  });

  it("devolve lista vazia quando o RLS recusa metas_visitas", async () => {
    // `metas_visitas` só é legível por gestão (migration 0006).
    respostas.set("resumo_metas_do_mes", { data: null, error: null });

    expect(await getMetasDoMes()).toEqual([]);
  });
});

describe("totalizarMetas", () => {
  const meta = (esperadas: number, realizadas: number) => ({
    siteId: 1,
    site: "S",
    grupo: "G",
    esperadas,
    realizadas,
  });

  it("soma as duas colunas", () => {
    expect(totalizarMetas([meta(10, 4), meta(30, 11)])).toEqual({
      esperadas: 40,
      realizadas: 15,
      percentual: 38,
    });
  });

  /**
   * Sem meta cadastrada o percentual e `null`, e nao zero: "0%" leria como
   * "nada foi feito", que e uma afirmacao diferente de "nao ha meta". A tela
   * mostra "—" nesse caso.
   */
  it("devolve null, e não 0%, quando não há meta", () => {
    expect(totalizarMetas([]).percentual).toBeNull();
    expect(totalizarMetas([meta(0, 0)]).percentual).toBeNull();
  });

  it("passa de 100% quando o realizado supera a meta", () => {
    // Superar a meta e um resultado legitimo e nao deve ser truncado no total.
    expect(totalizarMetas([meta(10, 13)]).percentual).toBe(130);
  });
});

describe("getTotaisDeCadastro", () => {
  it("conta sem trazer linha nenhuma", async () => {
    respostas.set("sites", { data: null, count: 42, error: null });
    respostas.set("qr_codes", { data: null, count: 17, error: null });

    expect(await getTotaisDeCadastro()).toEqual({ sitesAtivos: 42, qrCodesAtivos: 17 });

    // `head: true` é o que evita puxar a tabela inteira para exibir um número.
    const select = chamadas.find((c) => c.tabela === "sites" && c.metodo === "select");
    expect(select?.args[1]).toEqual({ count: "exact", head: true });
  });

  it("filtra por ativo nas duas contagens", async () => {
    await getTotaisDeCadastro();

    const eqs = chamadas.filter((c) => c.metodo === "eq");
    expect(eqs.map((c) => c.tabela).sort()).toEqual(["qr_codes", "sites"]);
    expect(eqs.every((c) => c.args[0] === "ativo" && c.args[1] === true)).toBe(true);
  });
});

describe("rotuloDoMes", () => {
  /**
   * O fuso vai explicito para o rotulo nao discordar do recorte: as views da
   * 0017 cortam o mes em -03:00. Sem isso, na virada do mes a tela diria
   * "agosto" sobre dados de julho.
   */
  it("formata no fuso da operação, não no do servidor", () => {
    // 1º de agosto 00:30 UTC ainda é 31 de julho em Brasília.
    expect(rotuloDoMes(new Date("2026-08-01T00:30:00Z"))).toBe("julho de 2026");
  });

  it("usa o mês seguinte assim que ele começa em Brasília", () => {
    expect(rotuloDoMes(new Date("2026-08-01T03:30:00Z"))).toBe("agosto de 2026");
  });
});
