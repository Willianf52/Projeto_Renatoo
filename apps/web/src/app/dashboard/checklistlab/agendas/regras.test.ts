import { describe, expect, it } from "vitest";
import { filtrarAgendas, quantidadeDeDatas, validarAgenda, type ValoresDaAgenda } from "./regras";

const BASE: ValoresDaAgenda = {
  nome: "  Ronda   mensal ",
  modeloId: "7",
  responsavelId: "",
  grupoUsuarioId: "",
  dataInicial: "2026-11-01",
  dataFinal: "2026-12-31",
  recorrencia: "SEMANAL",
  toleranciaDias: "2",
  ativo: true,
  sites: ["3", "3", "9"],
};

describe("validarAgenda", () => {
  it("normaliza o nome, tira site repetido e converte os números", () => {
    expect(validarAgenda(BASE)).toEqual({
      ok: true,
      agenda: {
        nome: "Ronda mensal",
        modeloId: 7,
        responsavelId: null,
        grupoUsuarioId: null,
        dataInicial: "2026-11-01",
        dataFinal: "2026-12-31",
        recorrencia: "SEMANAL",
        toleranciaDias: 2,
        ativo: true,
        sites: [3, 9],
      },
    });
  });

  it("recusa sem site, data invertida, data inexistente, recorrência e tolerância tortas", () => {
    const casos: [Partial<ValoresDaAgenda>, string][] = [
      [{ sites: [] }, "Escolha ao menos um site."],
      [{ dataFinal: "2026-10-01" }, "A data final não pode ser antes da inicial."],
      [{ dataInicial: "2026-02-30" }, "Informe a data inicial."],
      [{ recorrencia: "HORARIO" }, "Escolha o padrão de recorrência."],
      [{ toleranciaDias: "-1" }, "A tolerância deve ser um número de dias entre 0 e 365."],
      [{ modeloId: "" }, "Escolha o checklist."],
    ];
    for (const [extra, erro] of casos) {
      expect(validarAgenda({ ...BASE, ...extra })).toEqual({ ok: false, erro });
    }
  });
});

describe("quantidadeDeDatas", () => {
  it("conta as datas da recorrência, com as duas pontas", () => {
    expect(quantidadeDeDatas("2026-11-01", "2026-11-29", "SEMANAL")).toBe(5);
    expect(quantidadeDeDatas("2026-01-31", "2026-12-31", "MENSAL")).toBe(12);
    expect(quantidadeDeDatas("2026-11-01", "2026-11-01", "DIARIO")).toBe(1);
    expect(quantidadeDeDatas("2026-11-02", "2026-11-01", "DIARIO")).toBe(0);
  });
});

describe("filtrarAgendas (filtros do sistema de referencia, 11/11/2026)", () => {
  const base = {
    checklist: "Frota",
    modeloId: 70,
    responsavelId: "u1",
    recorrencia: "SEMANAL",
    sites: [{ id: 5 }],
  };
  const agendas = [
    { ...base, nome: "Novembro", dataInicial: "2026-11-01", dataFinal: "2026-11-30" },
    { ...base, nome: "Dezembro", dataInicial: "2026-12-01", dataFinal: "2026-12-31", modeloId: 3, responsavelId: "u2", recorrencia: "MENSAL", sites: [{ id: 9 }] },
  ];
  const nomes = (filtros: Parameters<typeof filtrarAgendas>[1]) => filtrarAgendas(agendas, filtros).map((a) => a.nome);

  it("sem filtro, todas", () => {
    expect(nomes({})).toEqual(["Novembro", "Dezembro"]);
  });

  it("periodo: entra a agenda cujo intervalo cruza o filtro", () => {
    expect(nomes({ dataInicial: "2026-11-15", dataFinal: "2026-11-20" })).toEqual(["Novembro"]);
    expect(nomes({ dataInicial: "2026-11-30" })).toEqual(["Novembro", "Dezembro"]);
    expect(nomes({ dataFinal: "2026-11-30" })).toEqual(["Novembro"]);
  });

  it("checklists, site, responsavel e recorrencia", () => {
    expect(nomes({ modelos: ["3"] })).toEqual(["Dezembro"]);
    expect(nomes({ site: "5" })).toEqual(["Novembro"]);
    expect(nomes({ responsavel: "u2" })).toEqual(["Dezembro"]);
    expect(nomes({ recorrencia: "SEMANAL" })).toEqual(["Novembro"]);
  });

  it("busca livre no nome da agenda ou do checklist", () => {
    expect(nomes({ busca: "dez" })).toEqual(["Dezembro"]);
    expect(nomes({ busca: "frota" })).toEqual(["Novembro", "Dezembro"]);
  });
});
