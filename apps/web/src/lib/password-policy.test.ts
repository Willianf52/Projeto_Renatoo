import { describe, expect, it } from "vitest";
import { MAX_BYTES, MAX_LENGTH, MIN_LENGTH, isPasswordValid } from "./password-policy";

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

  it("o teto e de 64 caracteres", () => {
    expect(MAX_LENGTH).toBe(64);
  });

  /** O motivo de o teto ter subido de 15 (14/09/2026): e o padrao do 1Password e do Chrome. */
  it("aceita a senha de 20 caracteres que um gerenciador gera por padrao", () => {
    expect(isPasswordValid("Ab@1".padEnd(20, "x"))).toBe(true);
  });

  it("aceita passphrase de quatro palavras", () => {
    expect(isPasswordValid("Cavalo-Bateria-Grampo-Correto-7")).toBe(true);
  });

  /**
   * O bcrypt do GoTrue so aceita ate 72 bytes. 40 "ç" cabem em 64 caracteres
   * mas ocupam 80 bytes: sem a guarda, a tela aceitaria e o servidor recusaria.
   */
  it("recusa senha dentro de 64 caracteres mas acima de 72 bytes", () => {
    const acentuada = "Ab@1" + "ç".repeat(40);
    expect(acentuada.length).toBeLessThanOrEqual(MAX_LENGTH);
    expect(new TextEncoder().encode(acentuada).length).toBeGreaterThan(MAX_BYTES);
    expect(isPasswordValid(acentuada)).toBe(false);
  });

  it("aceita senha acentuada que cabe nos 72 bytes", () => {
    expect(isPasswordValid("Ab@1" + "ç".repeat(30))).toBe(true);
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
