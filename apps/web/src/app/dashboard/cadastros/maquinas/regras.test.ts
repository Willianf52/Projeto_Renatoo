import { describe, expect, it } from "vitest";
import { dataNaTela, ehTipoDeItem, ehTipoDeManutencao, lerQuantidade, rotuloDaManutencao, rotuloDoItem } from "./regras";

describe("maquinas e acessorios", () => {
  it("reconhece os tipos e da o nome de tela", () => {
    expect(ehTipoDeManutencao("AUTONOMA")).toBe(true);
    expect(ehTipoDeManutencao("OUTRA")).toBe(false);
    expect(rotuloDaManutencao("AUTONOMA")).toBe("Autônoma");
    expect(ehTipoDeItem("PRODUTO")).toBe(true);
    expect(rotuloDoItem("ACESSORIO")).toBe("Acessório");
  });

  it("le a quantidade digitada", () => {
    expect(lerQuantidade("2")).toBe(2);
    expect(lerQuantidade("1.500")).toBe(1500);
    expect(lerQuantidade("-1")).toBeNull();
    expect(lerQuantidade("abc")).toBeNull();
  });

  it("mostra a data como dd/mm/aaaa", () => {
    expect(dataNaTela("2026-11-22")).toBe("22/11/2026");
  });
});
