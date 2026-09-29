import { describe, expect, it } from "vitest";
import { CARGOS, podeFinalizarVisita, podeRegistrarVisita } from "./cargos";

describe("podeFinalizarVisita", () => {
  // Espelha `autorizacao.pode_finalizar_visita` (migration 0059). Se um cargo
  // entrar ou sair la, este teste e o que avisa que o app ficou para tras.
  it("so INSPETOR e GESTOR fecham visita pelo app", () => {
    expect(CARGOS.filter((cargo) => podeFinalizarVisita(cargo))).toEqual(["GESTOR", "INSPETOR"]);
  });

  it("perfil ainda nao carregado nao ganha o botao", () => {
    expect(podeFinalizarVisita(null)).toBe(false);
    expect(podeFinalizarVisita(undefined)).toBe(false);
  });
});

describe("podeRegistrarVisita", () => {
  // Espelha `autorizacao.pode_registrar_visita()` (migration 0060).
  it("so INSPETOR e GESTOR fazem ronda", () => {
    expect(CARGOS.filter((cargo) => podeRegistrarVisita(cargo))).toEqual(["GESTOR", "INSPETOR"]);
  });

  it("perfil ainda nao carregado nao vai para a camera", () => {
    expect(podeRegistrarVisita(undefined)).toBe(false);
  });
});
