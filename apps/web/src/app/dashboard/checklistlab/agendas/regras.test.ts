import { describe, expect, it } from "vitest";
import { quantidadeDeDatas, validarAgenda, type ValoresDaAgenda } from "./regras";

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
