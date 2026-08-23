import { describe, expect, it } from "vitest";
import {
  combinaFiltrosDeDetalhe,
  contarInspecoesPorSiteEDia,
  extrairFiltros,
  formatarDiaCurto,
  listarDias,
  paraLinhaDeExportacao,
  type Filtros,
} from "./queries";

function leitura(
  visitaId: number,
  siteId: number | null,
  dataHora: string,
  extra: Record<string, unknown> = {},
) {
  return {
    visita_id: visitaId,
    data_hora: dataHora,
    evento_id: null,
    qr_code_id: null,
    acao_id: null,
    visitas: siteId === null ? null : { site_id: siteId },
    ...extra,
  };
}

const SEM_FILTROS: Filtros = {};

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

describe("combinaFiltrosDeDetalhe", () => {
  it("sem filtro de detalhe, todo grupo combina", () => {
    expect(combinaFiltrosDeDetalhe([leitura(1, 10, "2026-08-11T09:00:00-03:00")], SEM_FILTROS)).toBe(true);
  });

  it("exige que a MESMA leitura bata com evento e checkpoint ao mesmo tempo", () => {
    const grupo = [
      leitura(1, 10, "2026-08-11T09:00:00-03:00", { evento_id: 5, qr_code_id: 1 }),
      leitura(1, 10, "2026-08-11T09:30:00-03:00", { evento_id: 9, qr_code_id: 1 }),
    ];
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "5", checkpoint: "1" })).toBe(true);
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "9", checkpoint: "2" })).toBe(false);
  });
});

describe("contarInspecoesPorSiteEDia", () => {
  const sitesBase = [
    { id: 1, nome: "Alfa" },
    { id: 2, nome: "Beta" },
  ];

  it("conta visitas distintas por dia, atribuidas ao dia da leitura mais antiga da visita", () => {
    const leituras = [
      leitura(100, 1, "2026-08-11T09:00:00-03:00"),
      leitura(100, 1, "2026-08-11T09:45:00-03:00"), // mesma visita, Termino -- nao conta 2x
      leitura(101, 1, "2026-08-12T09:00:00-03:00"),
    ];

    const linhas = contarInspecoesPorSiteEDia(sitesBase, leituras, SEM_FILTROS);
    const alfa = linhas.find((l) => l.siteId === 1)!;

    expect(alfa.porDia).toEqual({ "2026-08-11": 1, "2026-08-12": 1 });
    expect(alfa.total).toBe(2);
  });

  it("duas visitas no mesmo Local e mesmo dia contam como 2, nao 1", () => {
    const leituras = [
      leitura(200, 2, "2026-08-11T08:00:00-03:00"),
      leitura(201, 2, "2026-08-11T14:00:00-03:00"),
    ];

    const beta = contarInspecoesPorSiteEDia(sitesBase, leituras, SEM_FILTROS).find((l) => l.siteId === 2)!;

    expect(beta.porDia["2026-08-11"]).toBe(2);
    expect(beta.total).toBe(2);
  });

  it("todo Local de sitesBase aparece, mesmo sem nenhuma leitura -- e o ponto do relatorio", () => {
    const linhas = contarInspecoesPorSiteEDia(sitesBase, [], SEM_FILTROS);

    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.total === 0)).toBe(true);
  });

  it("leitura de um site fora de sitesBase e ignorada na saida", () => {
    const leituras = [leitura(300, 999, "2026-08-11T09:00:00-03:00")];

    const linhas = contarInspecoesPorSiteEDia(sitesBase, leituras, SEM_FILTROS);

    expect(linhas.map((l) => l.siteId)).toEqual([1, 2]);
    expect(linhas.every((l) => l.total === 0)).toBe(true);
  });

  it("ordena as linhas por nome do Local", () => {
    const linhas = contarInspecoesPorSiteEDia(
      [
        { id: 2, nome: "Zeta" },
        { id: 1, nome: "Alfa" },
      ],
      [],
      SEM_FILTROS,
    );

    expect(linhas.map((l) => l.siteNome)).toEqual(["Alfa", "Zeta"]);
  });
});

describe("paraLinhaDeExportacao", () => {
  it("preenche 0 nos dias sem inspecao e o total no final", () => {
    const linha = { siteId: 1, siteNome: "Alfa", porDia: { "2026-08-12": 3 }, total: 3 };
    const dias = ["2026-08-11", "2026-08-12", "2026-08-13"];

    expect(paraLinhaDeExportacao(linha, dias)).toEqual(["Alfa", "0", "3", "0", "3"]);
  });
});
