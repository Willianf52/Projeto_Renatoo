import { describe, expect, it } from "vitest";
import {
  calcularSilencio,
  limiteDeSilencioHoras,
  montarMensagemDeSilencio,
  PADRAO_SILENCIO_HORAS,
} from "./importacao-alerta";

describe("limiteDeSilencioHoras", () => {
  it("usa o valor da env quando é um número positivo válido", () => {
    expect(limiteDeSilencioHoras("6")).toBe(6);
    expect(limiteDeSilencioHoras("0.5")).toBe(0.5);
  });

  it("cai para o padrão quando a env está ausente, vazia, zero, negativa ou não numérica", () => {
    expect(limiteDeSilencioHoras(undefined)).toBe(PADRAO_SILENCIO_HORAS);
    expect(limiteDeSilencioHoras("")).toBe(PADRAO_SILENCIO_HORAS);
    expect(limiteDeSilencioHoras("0")).toBe(PADRAO_SILENCIO_HORAS);
    expect(limiteDeSilencioHoras("-5")).toBe(PADRAO_SILENCIO_HORAS);
    expect(limiteDeSilencioHoras("abc")).toBe(PADRAO_SILENCIO_HORAS);
  });
});

describe("calcularSilencio", () => {
  const AGORA = new Date("2026-08-21T12:00:00Z").getTime();

  it("tabela vazia (nulo) está sempre em silêncio, sem 'horas desde' numérico", () => {
    expect(calcularSilencio(null, 24, AGORA)).toEqual({
      emSilencio: true,
      horasDesdeUltima: null,
    });
  });

  it("última linha dentro do limite não está em silêncio", () => {
    const resultado = calcularSilencio("2026-08-21T10:00:00Z", 24, AGORA);
    expect(resultado.emSilencio).toBe(false);
    expect(resultado.horasDesdeUltima).toBeCloseTo(2, 5);
  });

  it("última linha exatamente no limite conta como silêncio (>=, não >)", () => {
    const resultado = calcularSilencio("2026-08-20T12:00:00Z", 24, AGORA);
    expect(resultado.emSilencio).toBe(true);
    expect(resultado.horasDesdeUltima).toBeCloseTo(24, 5);
  });

  it("última linha além do limite está em silêncio", () => {
    const resultado = calcularSilencio("2026-08-18T12:00:00Z", 24, AGORA);
    expect(resultado.emSilencio).toBe(true);
    expect(resultado.horasDesdeUltima).toBeCloseTo(72, 5);
  });
});

describe("montarMensagemDeSilencio", () => {
  it("tabela nunca recebeu lote", () => {
    expect(montarMensagemDeSilencio({ emSilencio: true, horasDesdeUltima: null }, 24)).toBe(
      "Nenhum lote de importação foi recebido ainda (tabela `importacoes` vazia). Limite configurado: 24h.",
    );
  });

  it("silêncio com última tentativa conhecida, uma casa decimal", () => {
    expect(montarMensagemDeSilencio({ emSilencio: true, horasDesdeUltima: 30.456 }, 24)).toBe(
      "Nenhum lote de importação chegou nas últimas 30.5 horas (limite: 24h).",
    );
  });
});
