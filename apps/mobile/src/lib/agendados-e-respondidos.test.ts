import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

import { dataBr, datasDoPeriodo, statusDoAgendamento } from "./agendados-e-respondidos";

describe("datasDoPeriodo", () => {
  const hoje = new Date(2026, 10, 4, 10, 0, 0);

  it("hoje: o proprio dia", () => {
    expect(datasDoPeriodo("hoje", hoje)).toEqual({ inicio: "2026-11-04", fim: "2026-11-04" });
  });

  it("proximos 7 dias", () => {
    expect(datasDoPeriodo("proximos7", hoje)).toEqual({ inicio: "2026-11-04", fim: "2026-11-11" });
  });

  it("ultimos 15 dias, atravessando o mes", () => {
    expect(datasDoPeriodo("ultimos15", hoje)).toEqual({ inicio: "2026-10-20", fim: "2026-11-04" });
  });
});

describe("dataBr e statusDoAgendamento", () => {
  it("formata sem fuso", () => {
    expect(dataBr("2026-11-04")).toBe("04/11/2026");
  });

  it("status desconhecido vira Agendado", () => {
    expect(statusDoAgendamento("ATRASADO")).toBe("ATRASADO");
    expect(statusDoAgendamento("OUTRO")).toBe("AGENDADO");
  });
});
