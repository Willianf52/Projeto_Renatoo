import { describe, expect, it } from "vitest";
import { MAX_LENGTH, MIN_LENGTH, isPasswordValid } from "./password-policy";

/** Base valida em todos os criterios, para variar um de cada vez. */
const SENHA_OK = "Senha@2024";

describe("isPasswordValid", () => {
  it("aceita uma senha que cumpre todos os criterios", () => {
    expect(isPasswordValid(SENHA_OK)).toBe(true);
  });

  it("cobra cada classe de caractere", () => {
    expect(isPasswordValid("senha@2024")).toBe(false); // sem maiuscula
    expect(isPasswordValid("SENHA@2024")).toBe(false); // sem minuscula
    expect(isPasswordValid("SenhaSenha@")).toBe(false); // sem numero
    expect(isPasswordValid("Senha20241")).toBe(false); // sem especial
  });

  it("respeita o comprimento minimo", () => {
    expect(isPasswordValid("Ab@1".padEnd(MIN_LENGTH - 1, "x"))).toBe(false);
    expect(isPasswordValid("Ab@1".padEnd(MIN_LENGTH, "x"))).toBe(true);
  });

  it("respeita o comprimento maximo", () => {
    expect(isPasswordValid("Ab@1".padEnd(MAX_LENGTH, "x"))).toBe(true);
    expect(isPasswordValid("Ab@1".padEnd(MAX_LENGTH + 1, "x"))).toBe(false);
  });

  /**
   * Registro do custo do teto atual, nao um comportamento desejado: e o padrao
   * do 1Password e do Chrome. Se o teto subir, este caso passa a falhar -- e a
   * falha e a noticia boa, porque significa que a senha de gerenciador voltou
   * a ser aceita. Ajuste ou remova o caso quando isso acontecer.
   */
  it("recusa a senha de 20 caracteres que um gerenciador gera por padrao", () => {
    expect(isPasswordValid("Ab@1".padEnd(20, "x"))).toBe(false);
  });

  /** A lista fechada "@+$#" recusava simbolos comuns de gerador de senha. */
  it("aceita qualquer simbolo como caractere especial", () => {
    for (const simbolo of ["!", "%", "&", "*", "-", "_", "?", "/"]) {
      expect(isPasswordValid(`Senha1${simbolo}${simbolo}`)).toBe(true);
    }
  });

  it("recusa senha vazia", () => {
    expect(isPasswordValid("")).toBe(false);
  });
});
