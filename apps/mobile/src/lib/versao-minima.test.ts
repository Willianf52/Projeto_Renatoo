import { describe, expect, it, vi } from "vitest";

import { compararVersoes, consultarVersaoMinima, precisaAtualizar } from "./versao-minima";

describe("compararVersoes", () => {
  it("ordena por numero, nao por texto", () => {
    // O degrau em que um piso escrito a mao falha: "1.10.0" vem DEPOIS de
    // "1.9.0" em numero e ANTES em ordem alfabetica. Um app 1.10.0 barrado por
    // um piso 1.9.0 seria um inspetor parado sem motivo.
    expect(compararVersoes("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("1.9.0", "1.10.0")).toBeLessThan(0);
  });

  it("trata iguais como iguais", () => {
    expect(compararVersoes("2.3.4", "2.3.4")).toBe(0);
  });

  it("completa segmento ausente com zero", () => {
    expect(compararVersoes("1.2", "1.2.0")).toBe(0);
    expect(compararVersoes("1.2", "1.2.1")).toBeLessThan(0);
  });

  it("ignora sufixo de pre-release", () => {
    expect(compararVersoes("1.2.3-beta", "1.2.3")).toBe(0);
  });
});

describe("precisaAtualizar", () => {
  it("bloqueia abaixo do piso", () => {
    expect(precisaAtualizar("1.0.0", "1.1.0")).toBe(true);
  });

  it("libera no piso e acima dele", () => {
    expect(precisaAtualizar("1.1.0", "1.1.0")).toBe(false);
    expect(precisaAtualizar("1.2.0", "1.1.0")).toBe(false);
  });

  it("libera quando nao ha piso conhecido", () => {
    // A falha aberta, que e a decisao central do modulo: sem resposta do
    // painel ninguem e barrado. Um portao que fecha quando nao consegue
    // perguntar para 15 inspetores no meio da ronda.
    expect(precisaAtualizar("0.0.1", null)).toBe(false);
  });
});

describe("consultarVersaoMinima", () => {
  it("le o piso devolvido pelo painel", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ minima: "1.4.0" }),
    });

    await expect(consultarVersaoMinima("https://painel.exemplo", fetchFalso as never)).resolves.toBe(
      "1.4.0",
    );
  });

  it("monta a URL sem barra dupla", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minima: null }) });

    await consultarVersaoMinima("https://painel.exemplo/", fetchFalso as never);

    expect(fetchFalso).toHaveBeenCalledWith(
      "https://painel.exemplo/api/app/versao-minima",
      expect.anything(),
    );
  });

  it("devolve nulo sem painel configurado, sem sequer tentar a rede", async () => {
    const fetchFalso = vi.fn();

    await expect(consultarVersaoMinima(undefined, fetchFalso as never)).resolves.toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("devolve nulo quando a rede falha", async () => {
    const fetchFalso = vi.fn().mockRejectedValue(new Error("sem sinal"));

    await expect(
      consultarVersaoMinima("https://painel.exemplo", fetchFalso as never),
    ).resolves.toBeNull();
  });

  it("devolve nulo em resposta de erro", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(
      consultarVersaoMinima("https://painel.exemplo", fetchFalso as never),
    ).resolves.toBeNull();
  });

  it("devolve nulo quando o corpo nao tem o formato esperado", async () => {
    // Painel respondendo HTML de erro, proxy de hotel devolvendo portal de
    // login: os dois chegam como 200 com corpo que nao e o contrato.
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ versao: "1.4.0" }),
    });

    await expect(
      consultarVersaoMinima("https://painel.exemplo", fetchFalso as never),
    ).resolves.toBeNull();
  });
});
