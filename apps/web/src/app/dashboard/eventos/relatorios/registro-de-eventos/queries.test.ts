import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const {
  extrairFiltros,
  formatarPercentual,
  getRegistroDeEventos,
  linhaDeTotal,
  montarLinhas,
  paraLinhasDeExportacao,
} = await import("./queries");

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`, como o
 * builder do PostgREST que `buscarEmPaginas` usa. */
function construtor(data: unknown, error: unknown = null) {
  const builder = {
    order: () => builder,
    range: () => Promise.resolve({ data, error }),
  };
  return builder;
}

function doBanco(
  site_nome: string,
  evento_nome: string,
  quantidade: number,
  site_id = 1,
  evento_id = 1,
  grupo_site_nome: string | null = null,
) {
  return { site_id, site_nome, grupo_site_nome, evento_id, evento_nome, quantidade };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("extrairFiltros", () => {
  it("le periodo, base da data e os selects da querystring", () => {
    expect(
      extrairFiltros({ data_inicial: "2026-03-01", data_final: "2026-03-31", base_data: "evento", sites: "7", usuario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3" }),
    ).toEqual({
      dataInicial: "2026-03-01",
      dataFinal: "2026-03-31",
      baseDeData: "evento",
      sites: "7",
      evento: undefined,
      usuario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
    });
  });

  it("descarta data que nao existe no calendario", () => {
    expect(extrairFiltros({ data_inicial: "2026-02-31" }).dataInicial).toBeUndefined();
  });

  it("cai na data de insercao quando a base vem ausente ou desconhecida", () => {
    expect(extrairFiltros({}).baseDeData).toBe("insercao");
    expect(extrairFiltros({ base_data: "qualquer" }).baseDeData).toBe("insercao");
  });
});

describe("montarLinhas", () => {
  it("soma o total e reparte a porcentagem entre as linhas", () => {
    const { linhas, total } = montarLinhas([
      doBanco("Site A", "Evento X", 3, 1, 1),
      doBanco("Site A", "Evento Y", 1, 1, 2),
    ]);

    expect(total).toBe(4);
    expect(linhas.map((linha) => linha.percentual)).toEqual([75, 25]);
  });

  it("ordena pela maior quantidade no relatorio inteiro, e nao agrupado por site", () => {
    const { linhas } = montarLinhas([
      doBanco("Hummell", "RH", 1, 1, 1),
      doBanco("Reserva dos Ipês", "PORTARIA", 5, 2, 2),
      doBanco("Hummell", "PORTARIA", 3, 1, 2),
    ]);

    expect(linhas.map((linha) => [linha.siteNome, linha.eventoNome, linha.quantidade])).toEqual([
      ["Reserva dos Ipês", "PORTARIA", 5],
      ["Hummell", "PORTARIA", 3],
      ["Hummell", "RH", 1],
    ]);
  });

  it("desempata pela hierarquia do site em pt-BR, depois pelo evento", () => {
    const { linhas } = montarLinhas([
      doBanco("Site B", "RH", 2, 2, 1),
      doBanco("Órgão", "RH", 2, 3, 1),
      doBanco("Site B", "LIMPEZA", 2, 2, 2),
    ]);

    expect(linhas.map((linha) => [linha.siteNome, linha.eventoNome])).toEqual([
      // "Órgão" antes de "Site B": ordem de pt-BR, nao de code point.
      ["Órgão", "RH"],
      ["Site B", "LIMPEZA"],
      ["Site B", "RH"],
    ]);
  });

  it("monta a hierarquia organizacao > grupo > site, sem o grupo quando nao ha", () => {
    const { linhas } = montarLinhas([
      doBanco("SICREDI - SUZANO", "LIMPEZA", 2, 1, 1, "SIC"),
      doBanco("Hummell", "RH", 1, 2, 1),
    ]);

    expect(linhas.map((linha) => linha.siteNiveis)).toEqual([
      ["UP Serviços", "SIC", "SICREDI - SUZANO"],
      ["UP Serviços", "Hummell"],
    ]);
  });

  it("nao divide por zero com lista vazia", () => {
    expect(montarLinhas([])).toEqual({ linhas: [], total: 0 });
  });
});

describe("formatarPercentual", () => {
  it("usa virgula decimal e duas casas, sem o simbolo (o cabecalho ja diz %)", () => {
    // 5 de 57, como a primeira linha da referencia.
    expect(formatarPercentual((5 / 57) * 100)).toBe("8,77");
    expect(formatarPercentual(100)).toBe("100,00");
  });
});

describe("getRegistroDeEventos", () => {
  it("nao consulta o banco sem as duas datas", async () => {
    expect(await getRegistroDeEventos({ baseDeData: "insercao", dataInicial: "2026-03-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda o periodo meio-aberto e a escolha de data para a funcao do banco", async () => {
    rpcMock.mockReturnValueOnce(construtor([doBanco("Site A", "Evento X", 2)])).mockReturnValueOnce(construtor([]));

    await getRegistroDeEventos({ baseDeData: "insercao", dataInicial: "2026-03-01", dataFinal: "2026-03-31" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_registro_de_eventos", {
      p_inicio: "2026-03-01T00:00:00-03:00",
      // Dia seguinte ao final: o limite superior e EXCLUSIVO.
      p_fim: "2026-04-01T00:00:00-03:00",
      p_por_data_insercao: true,
      p_filtros: {},
    });
  });

  it("envia so os filtros preenchidos, com as chaves que a funcao conhece", async () => {
    rpcMock.mockReturnValueOnce(construtor([])).mockReturnValueOnce(construtor([]));

    await getRegistroDeEventos({
      baseDeData: "evento",
      dataInicial: "2026-03-01",
      dataFinal: "2026-03-31",
      sites: "7",
      evento: "",
      usuario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
    });

    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_por_data_insercao: false,
      p_filtros: { site: "7", funcionario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3" },
    });
  });
});

describe("exportacao", () => {
  const registro = montarLinhas([
    doBanco("Site A", "Evento X", 3, 1, 1, "Grupo"),
    doBanco("Site A", "Evento Y", 1, 1, 2, "Grupo"),
  ]);

  it("leva as quatro colunas de texto, sem a de Ações", () => {
    expect(paraLinhasDeExportacao(registro)).toEqual([
      ["UP Serviços > Grupo > Site A", "Evento X", "3", "75,00"],
      ["UP Serviços > Grupo > Site A", "Evento Y", "1", "25,00"],
    ]);
  });

  it("fecha o rodape em 100% do total", () => {
    expect(linhaDeTotal(registro)).toEqual(["TOTAL:", "", "4", "100,00"]);
  });

  it("nao anuncia 100% quando nao ha nada somado", () => {
    expect(linhaDeTotal({ linhas: [], total: 0 })).toEqual(["TOTAL:", "", "0", "0,00"]);
  });
});
