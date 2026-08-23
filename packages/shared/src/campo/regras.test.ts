import { describe, expect, it } from "vitest";
import { chaveDaVisita, normalizarInstante, temCoordenada } from "./regras";

describe("normalizarInstante", () => {
  it("aceita as tres formas de fuso e devolve UTC", () => {
    // As tres sao equivalentes: o mesmo instante escrito de tres jeitos que
    // aparecem de verdade -- `Z` do servidor, `-03:00` do padrao ISO e
    // `-0300` sem dois-pontos, que a rota de importacao sempre aceitou.
    expect(normalizarInstante("2026-08-01T08:12:00Z")).toEqual({
      ok: true,
      iso: "2026-08-01T08:12:00.000Z",
    });
    expect(normalizarInstante("2026-08-01T08:12:00-03:00")).toEqual({
      ok: true,
      iso: "2026-08-01T11:12:00.000Z",
    });
    expect(normalizarInstante("2026-08-01T08:12:00-0300")).toEqual({
      ok: true,
      iso: "2026-08-01T11:12:00.000Z",
    });
  });

  it("recusa timestamp sem fuso", () => {
    // O caso que a regra existe para pegar: sem fuso o valor seria lido no
    // fuso de quem processa, e o mesmo envio geraria horarios diferentes no
    // celular do inspetor e no servidor.
    expect(normalizarInstante("2026-08-01T08:12:00")).toEqual({
      ok: false,
      motivo: "sem-fuso",
    });
  });

  it("recusa data/hora impossivel mesmo com fuso", () => {
    expect(normalizarInstante("2026-08-01T25:00:00-03:00")).toEqual({
      ok: false,
      motivo: "data-invalida",
    });
  });

  it("ignora espaco nas bordas antes de validar o fuso", () => {
    expect(normalizarInstante("  2026-08-01T08:12:00Z  ")).toEqual({
      ok: true,
      iso: "2026-08-01T08:12:00.000Z",
    });
  });
});

describe("temCoordenada", () => {
  it("trata ausente, nulo e vazio como sem sinal", () => {
    expect(temCoordenada(undefined)).toBe(false);
    expect(temCoordenada(null)).toBe(false);
    expect(temCoordenada("")).toBe(false);
  });

  it("considera zero uma coordenada valida", () => {
    // Latitude 0 e um ponto legitimo (linha do Equador). Um teste de
    // veracidade (`if (valor)`) descartaria justamente esse caso.
    expect(temCoordenada(0)).toBe(true);
    expect(temCoordenada("0")).toBe(true);
  });
});

describe("chaveDaVisita", () => {
  it("combina numero da coleta e site", () => {
    // A migration 0004 declara `unique (numero_coleta, site_id)`: o numero
    // vem do dispositivo e so e unico dentro de um site.
    expect(chaveDaVisita(12, 3)).toBe("12::3");
    expect(chaveDaVisita(12, 3)).not.toBe(chaveDaVisita(12, 4));
  });
});
