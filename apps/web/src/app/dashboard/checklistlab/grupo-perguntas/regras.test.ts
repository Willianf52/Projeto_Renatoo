import { describe, expect, it } from "vitest";
import { nomeDaCopia } from "./regras";

describe("nomeDaCopia (Cópia completa, como no antigo)", () => {
  it("primeira cópia ganha ' cópia (1)'", () => {
    expect(nomeDaCopia("Limpeza", ["Limpeza"])).toBe("Limpeza cópia (1)");
  });

  it("pula o contador já usado, sem diferenciar maiúsculas", () => {
    expect(nomeDaCopia("Limpeza", ["Limpeza", "LIMPEZA CÓPIA (1)"])).toBe("Limpeza cópia (2)");
  });

  it("corta o nome original para caber nos 100 caracteres", () => {
    const longo = "x".repeat(100);
    const copia = nomeDaCopia(longo, [longo]);
    expect(copia.length).toBe(100);
    expect(copia.endsWith(" cópia (1)")).toBe(true);
  });
});
