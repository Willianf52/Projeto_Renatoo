import { describe, expect, it } from "vitest";
import { lerKm, normalizarPlaca, placaNaTela, situacaoDaRevisao } from "./regras";

describe("normalizarPlaca", () => {
  it("aceita a placa antiga e a Mercosul, com ou sem hifen e em minusculas", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("ABC1D23")).toBe("ABC1D23");
    expect(normalizarPlaca(" abc 1d23 ")).toBe("ABC1D23");
  });

  it("recusa o que nao e placa", () => {
    expect(normalizarPlaca("AB1234")).toBeNull();
    expect(normalizarPlaca("1BC1234")).toBeNull();
    expect(normalizarPlaca("ABC12345")).toBeNull();
  });

  it("mostra a placa com hifen", () => {
    expect(placaNaTela("ABC1D23")).toBe("ABC-1D23");
  });
});

describe("situacaoDaRevisao", () => {
  it("em dia antes dos 9.000 km", () => {
    const s = situacaoDaRevisao(28_000, 20_000);
    expect(s.tom).toBe("em-dia");
    expect(s.faltam).toBe(2_000);
  });

  it("perto a partir dos 9.000 km", () => {
    const s = situacaoDaRevisao(29_000, 20_000);
    expect(s.tom).toBe("perto");
    expect(s.rotulo).toBe("Revisão em 1.000 km");
  });

  it("vencida a partir dos 10.000 km", () => {
    const s = situacaoDaRevisao(30_500, 20_000);
    expect(s.tom).toBe("vencida");
    expect(s.rotulo).toBe("Revisão vencida há 500 km");
  });
});

describe("lerKm", () => {
  it("aceita com ponto de milhar e com 'km'", () => {
    expect(lerKm("12.345")).toBe(12_345);
    expect(lerKm("12345 km")).toBe(12_345);
  });

  it("recusa texto, negativo e acima do limite", () => {
    expect(lerKm("doze")).toBeNull();
    expect(lerKm("-5")).toBeNull();
    expect(lerKm("3000000")).toBeNull();
  });
});
