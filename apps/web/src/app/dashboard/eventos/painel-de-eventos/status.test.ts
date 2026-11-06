import { describe, expect, it } from "vitest";
import { anelDoStatus, rotuloDoStatus, STATUS, STATUS_EM_ABERTO } from "./status";

describe("status do Painel (0094)", () => {
  it("a lista e a do antigo: Concluido, sem Atendido", () => {
    expect(STATUS.map((s) => s.label)).toEqual([
      "Aguardando",
      "Em Análise",
      "Concluído",
      "Não Realizado",
      "Cancelado",
      "Pré-crítico",
      "Crítico",
      "Alerta",
      "Pânico",
    ]);
  });

  it("linha antiga com ATENDIDO e lida como Concluido", () => {
    expect(rotuloDoStatus("ATENDIDO")).toBe("Concluído");
    expect(anelDoStatus("ATENDIDO")).toBe(anelDoStatus("CONCLUIDO"));
  });

  it("'Tarefas em Aberto' sao os que nao foram encerrados", () => {
    expect(STATUS_EM_ABERTO).toEqual(["AGUARDANDO", "EM_ANALISE", "PRE_CRITICO", "CRITICO", "ALERTA", "PANICO"]);
  });
});
