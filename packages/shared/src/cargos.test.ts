import { describe, expect, it } from "vitest";
import { CARGOS, listaSoAsMinhas, podeFinalizarVisita, podeRegistrarVisita } from "./cargos";

describe("podeFinalizarVisita", () => {
  // Espelha `autorizacao.pode_finalizar_visita` (migrations 0059 e 0069). Se um
  // cargo entrar ou sair la, este teste e o que avisa que o app ficou para tras.
  it("todo cargo, menos CLIENTE, fecha visita pelo app", () => {
    expect(CARGOS.filter((cargo) => podeFinalizarVisita(cargo))).toEqual([
      "GESTOR",
      "SUPERVISOR",
      "OPERACIONAL",
      "OPERADOR",
      "INSPETOR",
    ]);
  });

  it("CLIENTE nao ganha o botao", () => {
    expect(podeFinalizarVisita("CLIENTE")).toBe(false);
  });

  it("perfil ainda nao carregado nao ganha o botao", () => {
    expect(podeFinalizarVisita(null)).toBe(false);
    expect(podeFinalizarVisita(undefined)).toBe(false);
  });
});

describe("podeRegistrarVisita", () => {
  // Espelha `autorizacao.pode_registrar_visita()` (migrations 0060 e 0069).
  it("todo cargo, menos CLIENTE, faz ronda", () => {
    expect(CARGOS.filter((cargo) => podeRegistrarVisita(cargo))).toEqual([
      "GESTOR",
      "SUPERVISOR",
      "OPERACIONAL",
      "OPERADOR",
      "INSPETOR",
    ]);
  });

  it("CLIENTE nao vai para a camera", () => {
    expect(podeRegistrarVisita("CLIENTE")).toBe(false);
  });

  it("perfil ainda nao carregado nao vai para a camera", () => {
    expect(podeRegistrarVisita(undefined)).toBe(false);
  });
});

describe("listaSoAsMinhas", () => {
  it("quem registra ve so as proprias visitas, menos o GESTOR", () => {
    expect(CARGOS.filter((cargo) => listaSoAsMinhas(cargo))).toEqual([
      "SUPERVISOR",
      "OPERACIONAL",
      "OPERADOR",
      "INSPETOR",
    ]);
  });

  it("GESTOR ve a lista inteira e CLIENTE segue com o recorte do cliente", () => {
    expect(listaSoAsMinhas("GESTOR")).toBe(false);
    expect(listaSoAsMinhas("CLIENTE")).toBe(false);
  });

  it("perfil ainda nao carregado nao recorta a lista", () => {
    expect(listaSoAsMinhas(null)).toBe(false);
    expect(listaSoAsMinhas(undefined)).toBe(false);
  });
});
