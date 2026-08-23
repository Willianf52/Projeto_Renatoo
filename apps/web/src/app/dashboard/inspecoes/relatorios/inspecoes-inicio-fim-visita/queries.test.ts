import { describe, expect, it } from "vitest";
import {
  combinaFiltrosDeDetalhe,
  extrairFiltros,
  formatarDuracao,
  montarLinhasDeInspecao,
  type Filtros,
} from "./queries";

const AREA_INICIO = { nome: "Início" };
const AREA_TERMINO = { nome: "Término" };

function leitura(
  visitaId: number,
  dataHora: string,
  area: { nome: string } | null,
  extra: Record<string, unknown> = {},
) {
  return {
    visita_id: visitaId,
    data_hora: dataHora,
    evento_id: null,
    acao_id: null,
    areas: area,
    eventos: null,
    visitas: {
      profiles: { nome_completo: "Manassés Almeida Ferreira" },
      sites: { nome: "Portal das Estrelas", regional: "SP" },
    },
    ...extra,
  };
}

const SEM_FILTROS: Filtros = {};

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-11",
        evento: "1",
        atividade: "2",
        motivo: "3",
        funcionario: "abc",
        grupo_site: "4",
        sites: "5",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-11",
      evento: "1",
      atividade: "2",
      motivo: "3",
      funcionario: "abc",
      grupoSite: "4",
      sites: "5",
    });
  });
});

describe("formatarDuracao", () => {
  it("reproduz o exemplo real: 09:48:10 - 07:27:33 = 02:20:37", () => {
    const inicio = new Date("2026-08-11T07:27:33-03:00").getTime();
    const termino = new Date("2026-08-11T09:48:10-03:00").getTime();
    expect(formatarDuracao(termino - inicio)).toBe("02:20:37");
  });
});

describe("combinaFiltrosDeDetalhe", () => {
  it("sem filtro de detalhe, todo grupo combina", () => {
    expect(combinaFiltrosDeDetalhe([leitura(1, "2026-08-11T09:00:00-03:00", AREA_INICIO)], SEM_FILTROS)).toBe(true);
  });

  it("exige que a mesma leitura bata com evento e atividade ao mesmo tempo", () => {
    const grupo = [
      leitura(1, "2026-08-11T09:00:00-03:00", AREA_INICIO, { evento_id: 5, acao_id: 1 }),
      leitura(1, "2026-08-11T09:30:00-03:00", AREA_TERMINO, { evento_id: 9, acao_id: 1 }),
    ];
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "5", atividade: "1" })).toBe(true);
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "9", atividade: "2" })).toBe(false);
  });
});

describe("montarLinhasDeInspecao", () => {
  it("monta uma linha por visita, com data/hora de inicio, termino e a duracao entre eles", () => {
    const leituras = [
      leitura(1, "2026-08-11T07:27:33-03:00", AREA_INICIO),
      leitura(1, "2026-08-11T09:48:10-03:00", AREA_TERMINO),
    ];

    const linhas = montarLinhasDeInspecao(leituras, SEM_FILTROS);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      dataHoraInicio: "2026-08-11T07:27:33-03:00",
      dataHoraTermino: "2026-08-11T09:48:10-03:00",
      usuario: "Manassés Almeida Ferreira",
      regional: "SP",
      site: "Portal das Estrelas",
    });
    expect(linhas[0].duracaoMs).toBe(new Date("2026-08-11T09:48:10-03:00").getTime() - new Date("2026-08-11T07:27:33-03:00").getTime());
  });

  it("ignora visita sem par Inicio/Termino completo", () => {
    const leituras = [leitura(1, "2026-08-11T09:00:00-03:00", AREA_INICIO)];
    expect(montarLinhasDeInspecao(leituras, SEM_FILTROS)).toEqual([]);
  });

  it("evento vem de qualquer leitura da visita que o tenha, nao so a de Inicio", () => {
    const leituras = [
      leitura(1, "2026-08-11T09:00:00-03:00", AREA_INICIO, { eventos: null }),
      leitura(1, "2026-08-11T09:45:00-03:00", AREA_TERMINO, { eventos: { nome: "Ocorrência" } }),
    ];

    const linhas = montarLinhasDeInspecao(leituras, SEM_FILTROS);

    expect(linhas[0].evento).toBe("Ocorrência");
  });

  it("ordena por Data/Hora de Inicio", () => {
    const leituras = [
      leitura(2, "2026-08-11T14:00:00-03:00", AREA_INICIO),
      leitura(2, "2026-08-11T14:30:00-03:00", AREA_TERMINO),
      leitura(1, "2026-08-11T07:00:00-03:00", AREA_INICIO),
      leitura(1, "2026-08-11T07:30:00-03:00", AREA_TERMINO),
    ];

    const linhas = montarLinhasDeInspecao(leituras, SEM_FILTROS);

    expect(linhas.map((l) => l.visitaId)).toEqual([1, 2]);
  });
});
