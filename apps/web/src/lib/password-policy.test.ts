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

  it("o teto e de 16 caracteres, em paridade com o sistema de referencia", () => {
    expect(MAX_LENGTH).toBe(16);
  });

  /**
   * O PRECO DO TETO DE 16, fixado como teste e nao so como comentario: e
   * exatamente o que a #79 tinha corrigido ao subir de 15 para 64, e o que a
   * decisao de 23/09/2026 reintroduziu de forma consciente. Se um dia alguem
   * estranhar que o gerenciador de senhas e recusado, o motivo esta aqui, e
   * nao em algum lugar do historico do git.
   */
  it("recusa a senha de 20 caracteres que um gerenciador gera por padrao", () => {
    expect(isPasswordValid("Ab@1".padEnd(20, "x"))).toBe(false);
  });

  it("recusa passphrase de quatro palavras", () => {
    expect(isPasswordValid("Cavalo-Bateria-Grampo-Correto-7")).toBe(false);
  });

  /**
   * O bcrypt do GoTrue so aceita ate 72 bytes, e a guarda de MAX_BYTES existe
   * por isso. Com o teto em 16 ela ficou INALCANCAVEL -- 16 caracteres
   * acentuados dao 32 bytes --, e este teste prova isso em vez de fingir que a
   * guarda ainda e exercitada. Se o teto de caracteres subir de novo, ele
   * falha, que e o aviso certo na hora certa.
   */
  it("o teto de bytes ficou inalcancavel com o teto de 16 caracteres", () => {
    const piorCaso = "ç".repeat(MAX_LENGTH);
    expect(new TextEncoder().encode(piorCaso).length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("aceita senha acentuada dentro do teto", () => {
    expect(isPasswordValid("Ab@1" + "ç".repeat(10))).toBe(true);
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
