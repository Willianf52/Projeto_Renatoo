import { describe, expect, it } from "vitest";
import { naRota } from "./DashboardSidebar";

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
