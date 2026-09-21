import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { extrairFiltros, getMapaDeEventos, linhaDeTotal, montarMapa, paraLinhasDeExportacao, TABLE_COLUMNS } =
  await import("./queries");

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`, como o
 * builder do PostgREST que `buscarEmPaginas` usa. */
function construtor(data: unknown, error: unknown = null) {
  const builder = {
    order: () => builder,
    range: () => Promise.resolve({ data, error }),
  };
  return builder;
}

function doBanco(evento_nome: string, dia: number, quantidade: number, evento_id = 1) {
  return { evento_id, evento_nome, dia, quantidade };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("extrairFiltros", () => {
  it("le mes, tipo de grafico e os selects da querystring", () => {
    expect(
      extrairFiltros({ mes: "2026-08", tipo_grafico: "linhas", evento: "3", atividade: "9", grupo_usuario: "2" }),
    ).toEqual({
      mes: "2026-08",
      evento: "3",
      tipoDeGrafico: "linhas",
      sites: undefined,
      usuario: undefined,
      atividade: "9",
      grupoSite: undefined,
      grupoUsuario: "2",
    });
  });

  it("deixa o mes vazio quando ausente ou fora do formato -- o campo abre em 'Mês/Ano'", () => {
    expect(extrairFiltros({}).mes).toBeUndefined();
    const filtros = extrairFiltros({ mes: "2026-13", tipo_grafico: "pizza" });
    expect(filtros.mes).toBeUndefined();
    expect(filtros.tipoDeGrafico).toBeUndefined();
  });
});

describe("montarMapa", () => {
  it("espalha as quantidades nos dias e soma a linha e a coluna", () => {
    const mapa = montarMapa([
      doBanco("RH", 1, 2, 1),
      doBanco("RH", 31, 1, 1),
      doBanco("PORTARIA", 1, 5, 2),
    ]);

    const rh = mapa.linhas.find((linha) => linha.eventoNome === "RH")!;
    expect(rh.porDia[0]).toBe(2);
    expect(rh.porDia[30]).toBe(1);
    expect(rh.total).toBe(3);
    expect(mapa.totaisPorDia[0]).toBe(7);
    expect(mapa.totalGeral).toBe(8);
  });

  it("ordena os eventos em pt-BR", () => {
    const mapa = montarMapa([doBanco("RH", 1, 1, 1), doBanco("Área Externa", 1, 1, 2), doBanco("BOMBEIRO", 1, 1, 3)]);
    expect(mapa.linhas.map((linha) => linha.eventoNome)).toEqual(["Área Externa", "BOMBEIRO", "RH"]);
  });

  it("mes sem ocorrencia da grade vazia e total zero", () => {
    const mapa = montarMapa([]);
    expect(mapa.linhas).toEqual([]);
    expect(mapa.totaisPorDia).toHaveLength(31);
    expect(mapa.totalGeral).toBe(0);
  });
});

describe("getMapaDeEventos", () => {
  it("nao consulta o banco sem Mês/Ano", async () => {
    expect(await getMapaDeEventos({})).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda o mes como periodo meio-aberto e so os filtros preenchidos", async () => {
    rpcMock.mockReturnValueOnce(construtor([])).mockReturnValueOnce(construtor([]));

    await getMapaDeEventos({ mes: "2026-02", evento: "3", sites: "", atividade: "9", tipoDeGrafico: "barras" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_mapa_de_eventos", {
      p_inicio: "2026-02-01T00:00:00-03:00",
      p_fim: "2026-03-01T00:00:00-03:00",
      p_filtros: { evento: "3", atividade: "9" },
    });
  });
});

describe("exportacao", () => {
  const mapa = montarMapa([doBanco("RH", 2, 3)]);

  it("tem as colunas Eventos, 1..31 e TOTAL", () => {
    expect(TABLE_COLUMNS).toHaveLength(33);
    expect(TABLE_COLUMNS[0]).toBe("Eventos");
    expect(TABLE_COLUMNS[32]).toBe("TOTAL");
  });

  it("deixa em branco o dia sem ocorrencia", () => {
    const [linha] = paraLinhasDeExportacao(mapa);
    expect(linha[0]).toBe("RH");
    expect(linha[1]).toBe("");
    expect(linha[2]).toBe("3");
    expect(linha[32]).toBe("3");
  });

  it("fecha com a linha Total", () => {
    const total = linhaDeTotal(mapa);
    expect(total[0]).toBe("Total");
    expect(total[2]).toBe("3");
    expect(total[32]).toBe("3");
  });
});
