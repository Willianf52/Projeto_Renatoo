import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identificarChamador, limitarTaxa } from "./rate-limit";

describe("limitarTaxa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite ate o limite dentro da janela", () => {
    const chave = "teste:permite";
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
  });

  it("recusa a partir da requisicao que excede o limite", () => {
    const chave = "teste:recusa";
    limitarTaxa(chave, 2, 60_000);
    limitarTaxa(chave, 2, 60_000);

    const resultado = limitarTaxa(chave, 2, 60_000);

    expect(resultado.permitido).toBe(false);
  });

  it("informa quantos segundos faltam para a janela reabrir", () => {
    const chave = "teste:retry-after";
    limitarTaxa(chave, 1, 30_000);

    const resultado = limitarTaxa(chave, 1, 30_000);

    expect(resultado).toEqual({ permitido: false, tenteNovamenteEmSegundos: 30 });
  });

  it("libera de novo depois que a janela expira", () => {
    const chave = "teste:expira";
    limitarTaxa(chave, 1, 10_000);
    expect(limitarTaxa(chave, 1, 10_000).permitido).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(limitarTaxa(chave, 1, 10_000)).toEqual({ permitido: true });
  });

  it("chaves diferentes tem contadores independentes", () => {
    limitarTaxa("rota-a:1.2.3.4", 1, 60_000);

    expect(limitarTaxa("rota-a:1.2.3.4", 1, 60_000).permitido).toBe(false);
    expect(limitarTaxa("rota-b:1.2.3.4", 1, 60_000).permitido).toBe(true);
    expect(limitarTaxa("rota-a:5.6.7.8", 1, 60_000).permitido).toBe(true);
  });
});

describe("identificarChamador", () => {
  it("usa o primeiro endereco de x-forwarded-for", () => {
    const request = { headers: { get: () => "203.0.113.9, 10.0.0.1, 10.0.0.2" } };

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  it("remove espaco ao redor do endereco", () => {
    const request = { headers: { get: () => "  203.0.113.9  , 10.0.0.1" } };

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  it("cai numa chave fixa quando o header nao existe", () => {
    const request = { headers: { get: () => null } };

    expect(identificarChamador(request)).toBe("sem-ip");
  });
});
