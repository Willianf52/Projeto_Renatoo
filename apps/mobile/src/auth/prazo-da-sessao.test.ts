import { describe, expect, it } from "vitest";
import { AVISO_DE_SESSAO_EXPIRADA, deveEncerrarPorPrazo } from "./prazo-da-sessao";

const AGORA = new Date("2026-09-14T12:00:00Z");
const haDias = (dias: number) => new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

describe("deveEncerrarPorPrazo", () => {
  it("encerra quando o login passou de 30 dias e ha sinal (perfil lido)", () => {
    expect(
      deveEncerrarPorPrazo({ ultimoLoginEm: haDias(31), perfilLidoComSucesso: true, agora: AGORA }),
    ).toBe(true);
  });

  /**
   * O caso que a regra existe para proteger: sem sinal o inspetor nao consegue
   * entrar de novo, e derruba-lo ali custaria o turno inteiro.
   */
  it("NAO encerra sem sinal, mesmo com o prazo vencido", () => {
    expect(
      deveEncerrarPorPrazo({ ultimoLoginEm: haDias(90), perfilLidoComSucesso: false, agora: AGORA }),
    ).toBe(false);
  });

  it("nao encerra dentro do prazo", () => {
    expect(
      deveEncerrarPorPrazo({ ultimoLoginEm: haDias(10), perfilLidoComSucesso: true, agora: AGORA }),
    ).toBe(false);
  });

  it("sem carimbo de login, nao encerra", () => {
    expect(deveEncerrarPorPrazo({ ultimoLoginEm: null, perfilLidoComSucesso: true, agora: AGORA })).toBe(
      false,
    );
  });

  it("o aviso diz o prazo", () => {
    expect(AVISO_DE_SESSAO_EXPIRADA).toContain("30 dias");
  });
});
