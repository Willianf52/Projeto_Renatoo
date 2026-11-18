import { describe, expect, it } from "vitest";
import { dataNaTela, ehPeriodo, hojeEmSaoPaulo, intervaloNaTela, lerDataDeInicio, rotuloDoPeriodo } from "./periodos";

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

describe("data de inicio da meta (0107)", () => {
  it("aceita um dia valido", () => {
    expect(lerDataDeInicio("2026-11-10")).toBe("2026-11-10");
    expect(lerDataDeInicio(" 2028-02-29 ")).toBe("2028-02-29");
  });

  it("recusa dia que nao existe, formato errado e ano fora da faixa", () => {
    expect(lerDataDeInicio("2026-02-31")).toBeNull();
    expect(lerDataDeInicio("10/11/2026")).toBeNull();
    expect(lerDataDeInicio("")).toBeNull();
    expect(lerDataDeInicio("2199-01-01")).toBeNull();
  });

  it("mostra a data como dd/mm/aaaa", () => {
    expect(dataNaTela("2026-11-10")).toBe("10/11/2026");
  });

  it("hoje e o dia de Sao Paulo, nao o de UTC", () => {
    // 02:30 UTC de 19/11 ainda e 18/11 em Sao Paulo (UTC-3).
    expect(hojeEmSaoPaulo(new Date("2026-11-19T02:30:00Z"))).toBe("2026-11-18");
  });
});
