import { describe, expect, it } from "vitest";
import { ehPeriodo, intervaloNaTela, rotuloDoPeriodo } from "./periodos";

describe("periodos da meta", () => {
  it("reconhece os quatro periodos e mais nada", () => {
    expect(["DIARIA", "SEMANAL", "QUINZENAL", "MENSAL"].every(ehPeriodo)).toBe(true);
    expect(ehPeriodo("ANUAL")).toBe(false);
  });

  it("nomeia cada periodo", () => {
    expect(rotuloDoPeriodo("QUINZENAL")).toBe("Quinzenal");
  });

  it("mostra o intervalo com o ultimo dia incluido", () => {
    expect(intervaloNaTela("2026-11-16", "2026-11-23")).toBe("16/11 a 22/11");
    expect(intervaloNaTela("2026-11-16", "2026-12-01")).toBe("16/11 a 30/11");
    expect(intervaloNaTela("2026-11-18", "2026-11-19")).toBe("18/11");
  });
});
