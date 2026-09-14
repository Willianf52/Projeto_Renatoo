import { describe, expect, it } from "vitest";
import { DIAS_MAXIMOS_DE_SESSAO, sessaoVencida } from "./sessao";

const AGORA = new Date("2026-09-14T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

const haDias = (dias: number) => new Date(AGORA.getTime() - dias * DIA).toISOString();

describe("sessaoVencida", () => {
  it("o prazo e de 30 dias", () => {
    expect(DIAS_MAXIMOS_DE_SESSAO).toBe(30);
  });

  it("login recente nao vence", () => {
    expect(sessaoVencida(haDias(1), AGORA)).toBe(false);
    expect(sessaoVencida(haDias(29), AGORA)).toBe(false);
  });

  it("exatamente no limite ainda vale; um instante depois, vence", () => {
    expect(sessaoVencida(haDias(30), AGORA)).toBe(false);
    expect(sessaoVencida(new Date(AGORA.getTime() - 30 * DIA - 1000).toISOString(), AGORA)).toBe(true);
  });

  it("login antigo vence", () => {
    expect(sessaoVencida(haDias(31), AGORA)).toBe(true);
    expect(sessaoVencida(haDias(400), AGORA)).toBe(true);
  });

  /** Sem o carimbo nao ha como medir -- trancar para fora seria pior. */
  it("ausente ou ilegivel nao vence", () => {
    expect(sessaoVencida(null, AGORA)).toBe(false);
    expect(sessaoVencida(undefined, AGORA)).toBe(false);
    expect(sessaoVencida("", AGORA)).toBe(false);
    expect(sessaoVencida("nao-e-data", AGORA)).toBe(false);
  });

  it("aceita o formato com offset que o Supabase devolve", () => {
    expect(sessaoVencida("2026-08-01T09:30:00.123456+00:00", AGORA)).toBe(true);
    expect(sessaoVencida("2026-09-10T09:30:00.123456+00:00", AGORA)).toBe(false);
  });

  it("sem `agora`, usa o relogio atual", () => {
    expect(sessaoVencida(new Date().toISOString())).toBe(false);
  });
});
