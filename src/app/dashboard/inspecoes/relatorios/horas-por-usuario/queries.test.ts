import { describe, expect, it } from "vitest";
import {
  combinaFiltroDeDetalhe,
  extrairFiltros,
  formatarDuracao,
  formatarMedia,
  somarHorasPorFuncionario,
  type Filtros,
} from "./queries";

const AREA_INICIO = { nome: "Início" };
const AREA_TERMINO = { nome: "Término" };

function leitura(
  visitaId: number,
  funcionarioId: string | null,
  dataHora: string,
  area: { nome: string } | null,
  extra: Record<string, unknown> = {},
) {
  return {
    visita_id: visitaId,
    data_hora: dataHora,
    qr_code_id: null,
    areas: area,
    visitas: funcionarioId ? { funcionario_id: funcionarioId } : null,
    ...extra,
  };
}

const SEM_FILTROS: Filtros = {};

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-18",
        coletor_dados: "1",
        funcionario: "abc",
        checkpoint: "3",
        grupo_usuario: "2",
        sites: "5",
        local: "6",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-18",
      coletorDados: "1",
      funcionario: "abc",
      checkpoint: "3",
      grupoUsuario: "2",
      sites: "5",
      local: "6",
    });
  });
});

describe("formatarDuracao", () => {
  it("formata HH:MM:SS, sem teto em 24h", () => {
    // 39:58:52, do exemplo real (Manasses Almeida Ferreira).
    const ms = ((39 * 60 + 58) * 60 + 52) * 1000;
    expect(formatarDuracao(ms)).toBe("39:58:52");
  });
});

describe("formatarMedia", () => {
  it("reproduz os 4 exemplos reais exatamente", () => {
    // Eric: 13:56:02 (50162s) / 18 visitas.
    expect(formatarMedia(50162 * 1000, 18)).toBe("00:46:26.7777");
    // Gesiel: 03:32:25 (12745s) / 2 visitas.
    expect(formatarMedia(12745 * 1000, 2)).toBe("01:46:12.5000");
    // Manasses: 39:58:52 (143932s) / 22 visitas.
    expect(formatarMedia(143932 * 1000, 22)).toBe("01:49:02.3636");
    // Odair: 13:47:29 (49649s) / 19 visitas.
    expect(formatarMedia(49649 * 1000, 19)).toBe("00:43:33.1052");
  });

  it("sem visitas, devolve '0' em vez de dividir por zero", () => {
    expect(formatarMedia(0, 0)).toBe("0");
  });
});

describe("combinaFiltroDeDetalhe", () => {
  it("sem checkpoint, todo grupo combina", () => {
    expect(combinaFiltroDeDetalhe([leitura(1, "f1", "2026-08-11T09:00:00-03:00", AREA_INICIO)], SEM_FILTROS)).toBe(
      true,
    );
  });

  it("combina se qualquer leitura do grupo tiver o checkpoint, nao precisa ser a mesma do Inicio", () => {
    const grupo = [
      leitura(1, "f1", "2026-08-11T09:00:00-03:00", AREA_INICIO, { qr_code_id: 5 }),
      leitura(1, "f1", "2026-08-11T09:45:00-03:00", AREA_TERMINO, { qr_code_id: 7 }),
    ];
    expect(combinaFiltroDeDetalhe(grupo, { ...SEM_FILTROS, checkpoint: "7" })).toBe(true);
    expect(combinaFiltroDeDetalhe(grupo, { ...SEM_FILTROS, checkpoint: "9" })).toBe(false);
  });
});

describe("somarHorasPorFuncionario", () => {
  const profilesBase = [
    { id: "f1", nome_completo: "Eric" },
    { id: "f2", nome_completo: "Ana" },
  ];

  it("soma a duracao das visitas do funcionario e conta quantas entraram na soma", () => {
    const leituras = [
      leitura(1, "f1", "2026-08-11T09:00:00-03:00", AREA_INICIO),
      leitura(1, "f1", "2026-08-11T09:45:07-03:00", AREA_TERMINO),
      leitura(2, "f1", "2026-08-12T08:00:00-03:00", AREA_INICIO),
      leitura(2, "f1", "2026-08-12T08:30:00-03:00", AREA_TERMINO),
    ];

    const linhas = somarHorasPorFuncionario(profilesBase, leituras, SEM_FILTROS);
    const eric = linhas.find((l) => l.funcionarioId === "f1")!;

    expect(eric.visitas).toBe(2);
    expect(eric.totalMs).toBe(45 * 60 * 1000 + 7000 + 30 * 60 * 1000);
  });

  it("todo funcionario de profilesBase aparece, mesmo com zero visitas", () => {
    const linhas = somarHorasPorFuncionario(profilesBase, [], SEM_FILTROS);

    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.totalMs === 0 && l.visitas === 0)).toBe(true);
  });

  it("visita sem par Inicio/Termino completo nao soma nem conta", () => {
    const leituras = [leitura(1, "f1", "2026-08-11T09:00:00-03:00", AREA_INICIO)];

    const eric = somarHorasPorFuncionario(profilesBase, leituras, SEM_FILTROS).find((l) => l.funcionarioId === "f1")!;

    expect(eric.visitas).toBe(0);
    expect(eric.totalMs).toBe(0);
  });

  it("ordena as linhas por nome", () => {
    const linhas = somarHorasPorFuncionario(profilesBase, [], SEM_FILTROS);
    expect(linhas.map((l) => l.nome)).toEqual(["Ana", "Eric"]);
  });
});
