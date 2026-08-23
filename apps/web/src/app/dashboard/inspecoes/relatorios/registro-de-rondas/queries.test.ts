import { describe, expect, it } from "vitest";
import {
  agruparEmLinhas,
  combinaFiltrosDeDetalhe,
  extrairFiltros,
  formatarDuracao,
  paraLinhaDeExportacao,
  type Filtros,
} from "./queries";

const AREA_INICIO = { nome: "Início" };
const AREA_TERMINO = { nome: "Término" };

function leitura(
  visitaId: number,
  siteId: number,
  siteNome: string,
  dataHora: string,
  area: { nome: string } | null,
  extra: Record<string, unknown> = {},
) {
  return {
    id: Math.random(),
    visita_id: visitaId,
    data_hora: dataHora,
    area_id: null,
    evento_id: null,
    qualificador_id: null,
    qr_code_id: null,
    acao_id: null,
    areas: area,
    visitas: { site_id: siteId, sites: { id: siteId, nome: siteNome, grupo_site_id: 1 } },
    ...extra,
  };
}

const SEM_FILTROS: Filtros = { mes: "2026-08" };

describe("extrairFiltros", () => {
  it("le mes e os filtros de detalhe da querystring", () => {
    expect(extrairFiltros({ mes: "2026-08", local: "3", atividade: "9", grupo_usuario: "2" })).toEqual({
      mes: "2026-08",
      local: "3",
      coletorDados: undefined,
      funcionario: undefined,
      area: undefined,
      evento: undefined,
      qualificador: undefined,
      checkpoint: undefined,
      atividade: "9",
      grupoSite: undefined,
      grupoUsuario: "2",
      motivo: undefined,
    });
  });

  it("cai no mes atual para valor ausente ou fora do formato yyyy-mm", () => {
    const mesAtual = extrairFiltros({}).mes;
    expect(mesAtual).toMatch(/^\d{4}-\d{2}$/);
    expect(extrairFiltros({ mes: "2026-13" }).mes).toBe(mesAtual);
  });
});

describe("formatarDuracao", () => {
  it("formata HH:MM:SS com zero a esquerda", () => {
    expect(formatarDuracao(65 * 1000)).toBe("00:01:05");
  });

  it("nao limita horas em 24 -- soma literal de segundos", () => {
    // 32h03m31s, como no exemplo real (Total de "32:03:31").
    const ms = ((32 * 60 + 3) * 60 + 31) * 1000;
    expect(formatarDuracao(ms)).toBe("32:03:31");
  });
});

describe("agruparEmLinhas", () => {
  it("calcula a duracao da ronda como Termino menos Inicio, no dia do Inicio", () => {
    const leituras = [
      leitura(1, 10, "ACE Limpeza", "2026-08-08T09:00:00-03:00", AREA_INICIO),
      leitura(1, 10, "ACE Limpeza", "2026-08-08T09:45:07-03:00", AREA_TERMINO),
    ];

    const linhas = agruparEmLinhas(leituras, SEM_FILTROS);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].siteNome).toBe("ACE Limpeza");
    expect(linhas[0].duracoesPorDia[7]).toEqual([45 * 60 * 1000 + 7000]); // dia 8 -> indice 7
    expect(linhas[0].totalMs).toBe(45 * 60 * 1000 + 7000);
  });

  it("empilha mais de uma ronda no mesmo Local e mesmo dia, e soma tudo no Total", () => {
    const leituras = [
      leitura(1, 10, "Condomínio Campos do Conde", "2026-08-11T08:00:00-03:00", AREA_INICIO),
      leitura(1, 10, "Condomínio Campos do Conde", "2026-08-11T10:02:49-03:00", AREA_TERMINO),
      leitura(2, 10, "Condomínio Campos do Conde", "2026-08-11T14:00:00-03:00", AREA_INICIO),
      leitura(2, 10, "Condomínio Campos do Conde", "2026-08-11T14:33:20-03:00", AREA_TERMINO),
    ];

    const linhas = agruparEmLinhas(leituras, SEM_FILTROS);

    const primeiraDuracao = (2 * 3600 + 2 * 60 + 49) * 1000; // 08:00:00 -> 10:02:49
    const segundaDuracao = 33 * 60 * 1000 + 20 * 1000; // 14:00:00 -> 14:33:20
    expect(linhas[0].duracoesPorDia[10]).toEqual([primeiraDuracao, segundaDuracao]);
    expect(linhas[0].totalMs).toBe(primeiraDuracao + segundaDuracao);
  });

  it("ignora visita sem par Inicio/Termino completo", () => {
    const leituras = [leitura(1, 10, "Site Solo", "2026-08-08T09:00:00-03:00", AREA_INICIO)];

    expect(agruparEmLinhas(leituras, SEM_FILTROS)).toEqual([]);
  });

  it("ordena as linhas por nome do Local", () => {
    const leituras = [
      leitura(1, 20, "Zeta", "2026-08-01T09:00:00-03:00", AREA_INICIO),
      leitura(1, 20, "Zeta", "2026-08-01T09:10:00-03:00", AREA_TERMINO),
      leitura(2, 10, "Alfa", "2026-08-01T09:00:00-03:00", AREA_INICIO),
      leitura(2, 10, "Alfa", "2026-08-01T09:10:00-03:00", AREA_TERMINO),
    ];

    expect(agruparEmLinhas(leituras, SEM_FILTROS).map((l) => l.siteNome)).toEqual(["Alfa", "Zeta"]);
  });
});

describe("combinaFiltrosDeDetalhe", () => {
  it("sem filtro de detalhe, toda visita combina", () => {
    const grupo = [leitura(1, 10, "Site", "2026-08-08T09:00:00-03:00", AREA_INICIO)];
    expect(combinaFiltrosDeDetalhe(grupo, SEM_FILTROS)).toBe(true);
  });

  it("visita combina se QUALQUER leitura do grupo bater com o filtro -- nao precisa ser a mesma leitura do Inicio", () => {
    const grupo = [
      leitura(1, 10, "Site", "2026-08-08T09:00:00-03:00", AREA_INICIO, { evento_id: null }),
      leitura(1, 10, "Site", "2026-08-08T09:45:00-03:00", AREA_TERMINO, { evento_id: 5 }),
    ];

    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "5" })).toBe(true);
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "9" })).toBe(false);
  });

  it("mais de um filtro de detalhe exige que a MESMA leitura bata com todos ao mesmo tempo", () => {
    const grupo = [
      leitura(1, 10, "Site", "2026-08-08T09:00:00-03:00", AREA_INICIO, { evento_id: 5, qualificador_id: 1 }),
      leitura(1, 10, "Site", "2026-08-08T09:45:00-03:00", AREA_TERMINO, { evento_id: 9, qualificador_id: 1 }),
    ];

    // evento=5 e qualificador=1 juntos so estao na leitura de Inicio.
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "5", qualificador: "1" })).toBe(true);
    // evento=9 so aparece com qualificador=1 tambem -- ok.
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "9", qualificador: "1" })).toBe(true);
    // combinacao que nenhuma leitura isolada satisfaz.
    expect(combinaFiltrosDeDetalhe(grupo, { ...SEM_FILTROS, evento: "5", qualificador: "2" })).toBe(false);
  });
});

describe("paraLinhaDeExportacao", () => {
  it("junta mais de uma duracao no mesmo dia com quebra de linha, e preenche dias vazios com celula vazia", () => {
    const linha = {
      siteId: 10,
      siteNome: "ACE Limpeza",
      duracoesPorDia: Array.from({ length: 31 }, (_, i) => (i === 3 ? [90000, 60000] : [])),
      totalMs: 150000,
    };

    const colunas = paraLinhaDeExportacao(linha);

    expect(colunas[0]).toBe("ACE Limpeza");
    expect(colunas[4]).toBe("00:01:30\n00:01:00"); // dia 4 -> indice 4 na saida (Local + 31 dias)
    expect(colunas[1]).toBe("");
    expect(colunas[colunas.length - 1]).toBe("00:02:30");
  });
});
