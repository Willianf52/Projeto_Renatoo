import { describe, expect, it } from "vitest";

import { numeroDaColeta, tituloDaColeta } from "./titulo-da-coleta";

describe("tituloDaColeta", () => {
  it("mostra o numero da visita, o mesmo do portal, e nao o UUID", () => {
    expect(tituloDaColeta(100)).toBe("Coleta 100");
  });

  it("sem visita ainda (Ver sites), Nova coleta", () => {
    expect(tituloDaColeta(null)).toBe("Nova coleta");
  });
});

describe("numeroDaColeta", () => {
  it("UUID do app vira o id da visita", () => {
    expect(numeroDaColeta("6e809ec4-1fbe-422f-9604-898b31f51573", 100)).toBe("100");
  });

  it("numero so de digitos (coleta importada) fica como esta", () => {
    expect(numeroDaColeta("1952", 7)).toBe("1952");
  });
});
