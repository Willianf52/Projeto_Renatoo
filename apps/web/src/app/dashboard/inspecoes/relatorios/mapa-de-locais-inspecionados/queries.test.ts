import { beforeEach, describe, expect, it, vi } from "vitest";

// A contagem (visitas distintas, dia da leitura mais antiga em -03:00, filtros
// de detalhe na mesma leitura) desceu para o banco na 0049 e e testada la:
// supabase/tests/database/relatorios_agregados_no_banco_test.sql.

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

/** Cadeia que aceita qualquer filtro/ordenacao e resolve com `data`. */
function cadeia(data: unknown) {
  const c: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "range"]) c[metodo] = () => c;
  c.then = (resolver: (valor: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolver);
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => cadeia([]), rpc: rpcMock }),
}));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const {
  extrairFiltros,
  formatarDiaCurto,
  getMapaDeLocaisInspecionados,
  listarDias,
  montarLinhasDoMapa,
  paraLinhaDeExportacao,
} = await import("./queries");

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(() => cadeia([]));
});

describe("extrairFiltros", () => {
  it("le os filtros da querystring, incluindo locais_inativos como booleano", () => {
    expect(extrairFiltros({ data_inicial: "2026-08-01", data_final: "2026-08-05", locais_inativos: "sim" })).toEqual(
      expect.objectContaining({ dataInicial: "2026-08-01", dataFinal: "2026-08-05", locaisInativos: true }),
    );
  });

  it("locais_inativos ausente ou diferente de 'sim' vira false", () => {
    expect(extrairFiltros({}).locaisInativos).toBe(false);
    expect(extrairFiltros({ locais_inativos: "nao" }).locaisInativos).toBe(false);
  });
});

describe("listarDias / formatarDiaCurto", () => {
  it("lista os dias inclusive, do inicio ao fim", () => {
    expect(listarDias("2026-08-11", "2026-08-13")).toEqual(["2026-08-11", "2026-08-12", "2026-08-13"]);
  });

  it("um unico dia devolve so ele mesmo", () => {
    expect(listarDias("2026-08-11", "2026-08-11")).toEqual(["2026-08-11"]);
  });

  it("formata yyyy-mm-dd como dd/mm", () => {
    expect(formatarDiaCurto("2026-08-11")).toBe("11/08");
  });
});

describe("montarLinhasDoMapa", () => {
  const sitesBase = [
    { id: 1, nome: "Alfa" },
    { id: 2, nome: "Beta" },
  ];

  it("espalha as contagens do banco nos dias e soma o total", () => {
    const alfa = montarLinhasDoMapa(sitesBase, [
      { site_id: 1, dia: "2026-08-11", quantidade: 2 },
      { site_id: 1, dia: "2026-08-12", quantidade: 1 },
    ]).find((l) => l.siteId === 1)!;

    expect(alfa.porDia).toEqual({ "2026-08-11": 2, "2026-08-12": 1 });
    expect(alfa.total).toBe(3);
  });

  it("todo Local de sitesBase aparece, mesmo sem contagem -- e o ponto do relatorio", () => {
    const linhas = montarLinhasDoMapa(sitesBase, []);

    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.total === 0)).toBe(true);
  });

  it("contagem de site fora de sitesBase (filtrado ou inativo) nao vira linha", () => {
    const linhas = montarLinhasDoMapa(sitesBase, [{ site_id: 999, dia: "2026-08-11", quantidade: 5 }]);

    expect(linhas.map((l) => l.siteId)).toEqual([1, 2]);
    expect(linhas.every((l) => l.total === 0)).toBe(true);
  });

  it("ordena as linhas por nome do Local", () => {
    const linhas = montarLinhasDoMapa(
      [
        { id: 2, nome: "Zeta" },
        { id: 1, nome: "Alfa" },
      ],
      [],
    );

    expect(linhas.map((l) => l.siteNome)).toEqual(["Alfa", "Zeta"]);
  });
});

describe("getMapaDeLocaisInspecionados", () => {
  it("consulta so os dias exibidos (ate 62), com o ultimo dia inclusivo", async () => {
    await getMapaDeLocaisInspecionados({ dataInicial: "2026-01-01", dataFinal: "2026-12-31", evento: "5", local: "3" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_mapa_de_locais", {
      p_inicio: "2026-01-01T00:00:00-03:00",
      // 62 dias a partir de 01/01 terminam em 03/03; o fim e o comeco do dia 04.
      p_fim: "2026-03-04T00:00:00-03:00",
      // Local recorta as LINHAS (lista de sites), nao a contagem.
      p_filtros: { evento: "5" },
    });
  });

  it("sem periodo completo, nao consulta nada", async () => {
    expect(await getMapaDeLocaisInspecionados({ dataInicial: "2026-08-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("paraLinhaDeExportacao", () => {
  it("preenche 0 nos dias sem inspecao e o total no final", () => {
    const linha = { siteId: 1, siteNome: "Alfa", porDia: { "2026-08-12": 3 }, total: 3 };
    const dias = ["2026-08-11", "2026-08-12", "2026-08-13"];

    expect(paraLinhaDeExportacao(linha, dias)).toEqual(["Alfa", "0", "3", "0", "3"]);
  });
});

describe("periodo torto na querystring", () => {
  /**
   * Aqui o sintoma era PIOR que nas outras tres telas: `listarDias` compara
   * `getTime()` com NaN, a comparacao da falso, o laco nao roda e o relatorio
   * sai VAZIO -- sem erro nenhum, com cara de "nao houve inspecao no periodo".
   * Um 500 pelo menos se percebe.
   */
  it("descarta data que nao existe em vez de produzir relatorio vazio", () => {
    const filtros = extrairFiltros({ data_inicial: "abc", data_final: "2026-13-01" });

    expect(filtros.dataInicial).toBeUndefined();
    expect(filtros.dataFinal).toBeUndefined();
  });

  it("mostra o que listarDias fazia com a data torta -- o motivo da guarda", () => {
    expect(listarDias("abc", "2026-08-05")).toEqual([]);
    expect(listarDias("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});
