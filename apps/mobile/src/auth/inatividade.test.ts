import { describe, expect, it } from "vitest";
import { LIMITE_DE_INATIVIDADE_MS, precisaConfirmar } from "./inatividade";

describe("precisaConfirmar", () => {
  it("nao pergunta sem ter saido do app", () => {
    expect(precisaConfirmar(null, Date.now())).toBe(false);
  });

  it("nao pergunta numa saida curta", () => {
    expect(precisaConfirmar(1_000, 1_000 + LIMITE_DE_INATIVIDADE_MS - 1)).toBe(false);
  });

  it("pergunta a partir do limite", () => {
    expect(precisaConfirmar(1_000, 1_000 + LIMITE_DE_INATIVIDADE_MS)).toBe(true);
  });
});
