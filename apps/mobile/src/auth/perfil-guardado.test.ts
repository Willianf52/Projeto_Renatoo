import { describe, expect, it, vi } from "vitest";

vi.mock("../campo/fila", () => ({ abrirFila: vi.fn() }));

const { perfilGuardadoValido } = await import("./perfil-guardado");

const ID = "11111111-2222-4333-8444-555555555555";
const perfil = { id: ID, email: "inspetor@teste.local", nome_completo: "Inspetor", cargo: "INSPETOR", ativo: true };

describe("perfilGuardadoValido", () => {
  it("devolve o perfil inteiro da conta pedida", () => {
    expect(perfilGuardadoValido(perfil, ID)).toEqual(perfil);
  });

  it("recusa a copia de outra conta (aparelho compartilhado)", () => {
    expect(perfilGuardadoValido(perfil, "99999999-8888-4777-8666-555555555555")).toBeNull();
  });

  it("aceita nome nulo, como no banco", () => {
    expect(perfilGuardadoValido({ ...perfil, nome_completo: null }, ID)?.nome_completo).toBeNull();
  });

  it("recusa copia incompleta ou corrompida", () => {
    expect(perfilGuardadoValido(null, ID)).toBeNull();
    expect(perfilGuardadoValido("texto", ID)).toBeNull();
    expect(perfilGuardadoValido({ ...perfil, ativo: "sim" }, ID)).toBeNull();
    expect(perfilGuardadoValido({ ...perfil, cargo: undefined }, ID)).toBeNull();
    expect(perfilGuardadoValido({ ...perfil, email: null }, ID)).toBeNull();
  });

  it("mantem o ativo=false da copia: a tela de conta inativa continua valendo sem sinal", () => {
    expect(perfilGuardadoValido({ ...perfil, ativo: false }, ID)?.ativo).toBe(false);
  });
});
