import { describe, expect, it } from "vitest";
import { itemDoSuporte, naRota, TELAS_DO_MENU } from "./telas-do-menu";

const MAPA = "/dashboard/eventos/relatorios/mapa-de-eventos";

describe("naRota", () => {
  it("marca a propria rota do item", () => {
    expect(naRota(MAPA, MAPA)).toBe(true);
  });

  it("marca as rotas abaixo dela (export, novo, editar)", () => {
    expect(naRota(`${MAPA}/export/pdf`, MAPA)).toBe(true);
  });

  it("nao marca outra rota que so comeca com o mesmo texto", () => {
    // O bug: abrir "Mapa de Eventos por Site" marcava "Mapa de Eventos" junto.
    expect(naRota(`${MAPA}-por-site`, MAPA)).toBe(false);
  });

  it("nao marca nada antes da hidratacao (pathname nulo)", () => {
    expect(naRota(null, MAPA)).toBe(false);
  });
});

describe("itemDoSuporte", () => {
  it("vira link externo com o endereco da variavel", () => {
    expect(itemDoSuporte(" https://wa.me/5500000000000 ")).toMatchObject({
      label: "Suporte",
      href: "https://wa.me/5500000000000",
      externo: true,
    });
  });

  it("some sem variavel, ou com endereco que nao e https", () => {
    expect(itemDoSuporte(undefined)).toBeNull();
    expect(itemDoSuporte("   ")).toBeNull();
    expect(itemDoSuporte("http://wa.me/5500000000000")).toBeNull();
    expect(itemDoSuporte("javascript:alert(1)")).toBeNull();
  });
});

describe("TELAS_DO_MENU", () => {
  it("nao inclui link externo: atalho da Pagina Principal e so tela do painel", () => {
    expect(TELAS_DO_MENU.every((tela) => tela.href.startsWith("/dashboard/"))).toBe(true);
  });
});
