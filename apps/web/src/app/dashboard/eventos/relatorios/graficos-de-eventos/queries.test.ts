import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const {
  agruparPorEvento,
  CORES_DOS_EVENTOS,
  extrairFiltros,
  fatiasDaPizza,
  formatarData,
  getGraficosDeEventos,
  montarSeries,
  paraPlanilha,
} = await import("./queries");

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`. */
function construtor(data: unknown) {
  const builder = { order: () => builder, range: () => Promise.resolve({ data, error: null }) };
  return builder;
}

function doBanco(site_id: number, evento_id: number, evento_nome: string, quantidade: number) {
  return { site_id, site_nome: `Site ${site_id}`, grupo_site_nome: null, evento_id, evento_nome, quantidade };
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

  it("descarta data invalida", () => {
    expect(extrairFiltros({ data_inicial: "31/02/2026" }).dataInicial).toBeUndefined();
  });
});

describe("agruparPorEvento", () => {
  it("soma o mesmo evento entre sites diferentes", () => {
    const { eventos, total } = agruparPorEvento([
      doBanco(1, 10, "PORTARIA", 4),
      doBanco(2, 10, "PORTARIA", 7),
      doBanco(2, 20, "RH", 3),
    ]);

    expect(eventos).toEqual([
      { eventoId: 10, eventoNome: "PORTARIA", quantidade: 11 },
      { eventoId: 20, eventoNome: "RH", quantidade: 3 },
    ]);
    expect(total).toBe(14);
  });

  it("ordena pelo id do evento, nao pela quantidade", () => {
    // Como a referencia desenha: no print, RH tinha o maior numero (24) e
    // aparecia em setimo, na ordem do catalogo.
    const { eventos } = agruparPorEvento([doBanco(1, 30, "RH", 24), doBanco(1, 10, "EPI", 2)]);

    expect(eventos.map((evento) => evento.eventoNome)).toEqual(["EPI", "RH"]);
  });

  it("devolve total zero sem linha nenhuma", () => {
    expect(agruparPorEvento([])).toEqual({ eventos: [], total: 0 });
  });
});

describe("fatiasDaPizza", () => {
  const evento = (eventoId: number, quantidade: number) => ({
    eventoId,
    eventoNome: `E${eventoId}`,
    quantidade,
  });

  it("da uma cor da paleta para cada evento quando cabem todos", () => {
    const fatias = fatiasDaPizza([evento(1, 5), evento(2, 3)]);

    expect(fatias).toEqual([
      { rotulo: "E1", valor: 5, cor: CORES_DOS_EVENTOS[0] },
      { rotulo: "E2", valor: 3, cor: CORES_DOS_EVENTOS[1] },
    ]);
  });

  it("junta os menores em 'Outros' quando ha mais eventos que cores", () => {
    // Nove eventos para oito cores: o menor (o de quantidade 1) sai da
    // paleta e vira "Outros" -- a nona fatia nao ganha cor inventada.
    const eventos = [
      evento(1, 10),
      evento(2, 20),
      evento(3, 30),
      evento(4, 40),
      evento(5, 50),
      evento(6, 60),
      evento(7, 70),
      evento(8, 80),
      evento(9, 1),
    ];

    const fatias = fatiasDaPizza(eventos);

    expect(fatias).toHaveLength(9);
    expect(fatias[8]).toEqual({ rotulo: "Outros", valor: 1, cor: expect.any(String) });
    expect(fatias.slice(0, 8).map((fatia) => fatia.rotulo)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
  });

  it("soma varios eventos pequenos num 'Outros' so, sem perder quantidade", () => {
    const eventos = Array.from({ length: 12 }, (_, i) => evento(i + 1, i + 1));
    const fatias = fatiasDaPizza(eventos);
    const totalDasFatias = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);

    expect(fatias).toHaveLength(9);
    // 1+2+3+4 = 10 (os quatro menores de 12 eventos, com oito cores).
    expect(fatias[8]).toMatchObject({ rotulo: "Outros", valor: 10 });
    expect(totalDasFatias).toBe(eventos.reduce((soma, e) => soma + e.quantidade, 0));
  });
});

describe("montarSeries", () => {
  it("joga tudo em Aguardando enquanto o schema nao tem tratativa", () => {
    const series = montarSeries([
      { eventoId: 1, eventoNome: "A", quantidade: 4 },
      { eventoId: 2, eventoNome: "B", quantidade: 6 },
    ]);

    expect(series).toHaveLength(7);
    expect(series[0]).toMatchObject({ nome: "Aguardando", valores: [4, 6] });
    expect(series.slice(1).every((serie) => serie.valores.every((valor) => valor === 0))).toBe(true);
  });
});

describe("paraPlanilha", () => {
  it("escreve o percentual de cada evento com uma casa", () => {
    const { colunas, linhas } = paraPlanilha(
      [
        { eventoId: 1, eventoNome: "RH", quantidade: 24 },
        { eventoId: 2, eventoNome: "EPI", quantidade: 2 },
      ],
      59,
    );

    expect(colunas[0]).toBe("Evento");
    expect(colunas.at(-1)).toBe("Percentual");
    // Os mesmos 40,7% e 3,4% do print da referencia.
    expect(linhas[0].at(-1)).toBe("40.7%");
    expect(linhas[1].at(-1)).toBe("3.4%");
  });

  it("nao divide por zero quando o total e zero", () => {
    const { linhas } = paraPlanilha([{ eventoId: 1, eventoNome: "RH", quantidade: 0 }], 0);
    expect(linhas[0].at(-1)).toBe("0.0%");
  });
});

describe("getGraficosDeEventos", () => {
  it("nao consulta sem as duas datas", async () => {
    expect(await getGraficosDeEventos({ dataInicial: "2026-09-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda so os filtros preenchidos para a funcao do banco", async () => {
    // Segunda pagina vazia: `buscarEmPaginas` so para quando uma volta sem
    // linha -- com uma pagina cheia repetida ele varreria ate o teto.
    rpcMock.mockReturnValueOnce(construtor([doBanco(1, 10, "PORTARIA", 2)])).mockReturnValueOnce(construtor([]));

    const resultado = await getGraficosDeEventos({
      dataInicial: "2026-09-01",
      dataFinal: "2026-09-18",
      evento: "10",
      sites: "",
    });

    expect(resultado).toEqual({
      eventos: [{ eventoId: 10, eventoNome: "PORTARIA", quantidade: 2 }],
      total: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "relatorio_registro_de_eventos",
      expect.objectContaining({ p_por_data_insercao: false, p_filtros: { evento: "10" } }),
    );
  });
});

describe("formatarData", () => {
  it("vira dd/mm/aaaa", () => {
    expect(formatarData("2026-09-01")).toBe("01/09/2026");
  });
});
