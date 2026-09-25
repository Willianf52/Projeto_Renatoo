import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock, from: fromMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { colunasDeExportacao, extrairFiltros, getMapaDeEventosPorSite, montarArvore, paraLinhasDeExportacao } =
  await import("./queries");

const DIAS = ["2026-09-01", "2026-09-02", "2026-09-03"];

const SITES = [
  { id: 1, nome: "Hummell", grupoNome: null },
  { id: 2, nome: "SICREDI - SUZANO", grupoNome: "SIC" },
  { id: 3, nome: "ACE Limpeza", grupoNome: null },
];

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`. */
function construtorRpc(data: unknown) {
  const builder = { order: () => builder, range: () => Promise.resolve({ data, error: null }) };
  return builder;
}

/** `from("sites")`: encadeia `.select().eq()` e e aguardavel. */
function construtorSites(data: unknown) {
  const resultado = Promise.resolve({ data, error: null });
  const builder = Object.assign(resultado, { select: () => builder, eq: vi.fn(() => builder) });
  return builder;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("extrairFiltros", () => {
  it("le o periodo e os selects, descartando data invalida", () => {
    expect(extrairFiltros({ data_inicial: "2026-09-01", data_final: "2026-02-31", sites: "4", usuario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3" })).toEqual({
      dataInicial: "2026-09-01",
      dataFinal: undefined,
      grupoUsuario: undefined,
      sites: "4",
      evento: undefined,
      usuario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
    });
  });
});

describe("montarArvore", () => {
  const raiz = montarArvore(DIAS, SITES, [
    { site_id: 1, dia: "2026-09-01", quantidade: 2 },
    { site_id: 2, dia: "2026-09-01", quantidade: 1 },
    { site_id: 2, dia: "2026-09-03", quantidade: 4 },
    // Site fora da base (inativo ou recortado): nao entra em soma nenhuma.
    { site_id: 99, dia: "2026-09-01", quantidade: 7 },
  ]);

  it("a organizacao soma os sites que estao na tela", () => {
    expect(raiz.nome).toBe("UP Serviços");
    expect(raiz.porDia).toEqual([3, 0, 4]);
  });

  it("grupos e sites soltos ficam juntos, em ordem pt-BR", () => {
    expect(raiz.filhos.map((filho) => filho.nome)).toEqual(["ACE Limpeza", "Hummell", "SIC"]);
  });

  it("o grupo soma os seus sites e os lista embaixo", () => {
    const sic = raiz.filhos.find((filho) => filho.nome === "SIC")!;
    expect(sic.porDia).toEqual([1, 0, 4]);
    expect(sic.filhos.map((filho) => filho.caminho)).toEqual(["UP Serviços > SIC > SICREDI - SUZANO"]);
  });

  it("site sem evento aparece com zeros", () => {
    const ace = raiz.filhos.find((filho) => filho.nome === "ACE Limpeza")!;
    expect(ace.porDia).toEqual([0, 0, 0]);
  });
});

describe("getMapaDeEventosPorSite", () => {
  it("nao consulta o banco sem as duas datas", async () => {
    expect(await getMapaDeEventosPorSite({ dataInicial: "2026-09-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("nao consulta quando a Data Final vem antes da Inicial", async () => {
    const mapa = await getMapaDeEventosPorSite({ dataInicial: "2026-09-10", dataFinal: "2026-09-01" });
    expect(mapa?.dias).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda o periodo meio-aberto e so os filtros preenchidos", async () => {
    fromMock.mockReturnValue(construtorSites([{ id: 1, nome: "Hummell", grupos_sites: null }]));
    rpcMock
      .mockReturnValueOnce(construtorRpc([{ site_id: 1, dia: "2026-09-02", quantidade: 3 }]))
      .mockReturnValueOnce(construtorRpc([]));

    const mapa = await getMapaDeEventosPorSite({
      dataInicial: "2026-09-01",
      dataFinal: "2026-09-03",
      evento: "5",
      usuario: "",
    });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_mapa_de_eventos_por_site", {
      p_inicio: "2026-09-01T00:00:00-03:00",
      p_fim: "2026-09-04T00:00:00-03:00",
      p_filtros: { evento: "5" },
    });
    expect(mapa?.raiz.porDia).toEqual([0, 3, 0]);
  });

  it("corta o periodo em 62 dias e avisa", async () => {
    fromMock.mockReturnValue(construtorSites([]));
    rpcMock.mockReturnValue(construtorRpc([]));

    const mapa = await getMapaDeEventosPorSite({ dataInicial: "2026-01-01", dataFinal: "2026-12-31" });

    expect(mapa?.dias).toHaveLength(62);
    expect(mapa?.diasExcedidos).toBe(true);
  });
});

describe("exportacao", () => {
  it("cabecalho com um dd/mm por dia", () => {
    expect(colunasDeExportacao(DIAS)).toEqual(["Site", "01/09", "02/09", "03/09"]);
  });

  it("sai a arvore inteira aberta, cada linha com o caminho completo", () => {
    const raiz = montarArvore(DIAS, SITES, [{ site_id: 2, dia: "2026-09-02", quantidade: 1 }]);
    expect(paraLinhasDeExportacao(raiz).map((linha) => linha[0])).toEqual([
      "UP Serviços",
      "UP Serviços > ACE Limpeza",
      "UP Serviços > Hummell",
      "UP Serviços > SIC",
      "UP Serviços > SIC > SICREDI - SUZANO",
    ]);
    expect(paraLinhasDeExportacao(raiz)[0]).toEqual(["UP Serviços", "0", "1", "0"]);
  });
});
