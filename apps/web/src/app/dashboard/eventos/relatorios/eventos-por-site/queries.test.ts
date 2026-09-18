import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { agruparPorSite, extrairFiltros, formatarData, getEventosPorSite } = await import("./queries");

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`. */
function construtor(data: unknown) {
  const builder = { order: () => builder, range: () => Promise.resolve({ data, error: null }) };
  return builder;
}

function doBanco(site_id: number, site_nome: string, evento_nome: string, quantidade: number, grupo: string | null = null) {
  return { site_id, site_nome, grupo_site_nome: grupo, evento_id: evento_nome.length, evento_nome, quantidade };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("extrairFiltros", () => {
  it("le o periodo e os selects da querystring", () => {
    expect(
      extrairFiltros({ data_inicial: "2026-09-01", data_final: "2026-09-18", atividade: "2", grupo_site: "3" }),
    ).toEqual({
      dataInicial: "2026-09-01",
      dataFinal: "2026-09-18",
      evento: undefined,
      sites: undefined,
      usuario: undefined,
      atividade: "2",
      grupoSite: "3",
      grupoUsuario: undefined,
    });
  });
});

describe("agruparPorSite", () => {
  const resultado = agruparPorSite([
    doBanco(1, "Hummell", "PORTARIA", 3),
    doBanco(1, "Hummell", "RH", 1),
    doBanco(2, "Reserva dos Ipês", "PORTARIA", 5),
    doBanco(3, "SICREDI - SUZANO", "LIMPEZA", 4, "SIC"),
  ]);

  it("soma o total geral", () => {
    expect(resultado.total).toBe(13);
  });

  it("um item por site, maior total primeiro, com empate pela hierarquia", () => {
    expect(resultado.sites.map((site) => [site.siteNiveis.join(" > "), site.total])).toEqual([
      ["UP Serviços > Reserva dos Ipês", 5],
      ["UP Serviços > Hummell", 4],
      ["UP Serviços > SIC > SICREDI - SUZANO", 4],
    ]);
  });

  it("guarda a quebra por evento de cada site, maior primeiro", () => {
    const hummell = resultado.sites.find((site) => site.siteNome === "Hummell")!;
    expect(hummell.eventos.map((evento) => [evento.eventoNome, evento.quantidade])).toEqual([
      ["PORTARIA", 3],
      ["RH", 1],
    ]);
  });
});

describe("getEventosPorSite", () => {
  it("nao consulta o banco sem as duas datas", async () => {
    expect(await getEventosPorSite({ dataFinal: "2026-09-18" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("usa o Registro de Eventos pela data do evento, com so os filtros preenchidos", async () => {
    rpcMock.mockReturnValueOnce(construtor([])).mockReturnValueOnce(construtor([]));

    await getEventosPorSite({ dataInicial: "2026-09-01", dataFinal: "2026-09-18", atividade: "2", usuario: "" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_registro_de_eventos", {
      p_inicio: "2026-09-01T00:00:00-03:00",
      p_fim: "2026-09-19T00:00:00-03:00",
      p_por_data_insercao: false,
      p_filtros: { atividade: "2" },
    });
  });
});

describe("formatarData", () => {
  it("yyyy-mm-dd -> dd/mm/aaaa", () => {
    expect(formatarData("2026-09-01")).toBe("01/09/2026");
  });
});
