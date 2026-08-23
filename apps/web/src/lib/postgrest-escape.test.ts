import { describe, expect, it } from "vitest";
import { escaparLike, escaparPostgrest, termoParaOr } from "./postgrest-escape";

describe("escaparLike", () => {
  it("deixa passar texto sem caractere especial", () => {
    expect(escaparLike("portaria")).toBe("portaria");
  });

  it("neutraliza o curinga de varios caracteres", () => {
    // Sem escape, "%" casaria com qualquer coisa e a busca devolveria a lista
    // inteira em vez do registro procurado.
    expect(escaparLike("50%")).toBe("50\\%");
  });

  it("neutraliza o curinga de um caractere", () => {
    expect(escaparLike("a_b")).toBe("a\\_b");
  });

  it("escapa a propria barra invertida", () => {
    // Crua, ela escaparia o caractere seguinte do termo.
    expect(escaparLike("a\\b")).toBe("a\\\\b");
  });

  it("escapa todas as ocorrencias, nao so a primeira", () => {
    expect(escaparLike("%_%")).toBe("\\%\\_\\%");
  });
});

describe("escaparPostgrest", () => {
  it("escapa aspa dupla, que fecharia o valor antes da hora", () => {
    expect(escaparPostgrest('a"b')).toBe('a\\"b');
  });

  it("escapa a barra invertida", () => {
    expect(escaparPostgrest("a\\b")).toBe("a\\\\b");
  });

  it("nao mexe em virgula e parenteses", () => {
    // Eles quebrariam a expressao se estivessem fora das aspas; dentro delas o
    // PostgREST os trata como texto, entao escapar seria sujar o termo.
    expect(escaparPostgrest("a,b(c)")).toBe("a,b(c)");
  });
});

describe("termoParaOr", () => {
  it("deixa passar texto comum", () => {
    expect(termoParaOr("portaria")).toBe("portaria");
  });

  it("dobra a barra que o escape do LIKE introduziu", () => {
    // "%" -> "\%" (escaparLike) -> "\\%" (escaparPostgrest). O PostgREST desfaz
    // um nivel ao tirar as aspas e o LIKE recebe "\%": um "%" literal.
    expect(termoParaOr("50%")).toBe("50\\\\%");
  });

  it("aplica os dois escapes na ordem certa", () => {
    // A ordem invertida escaparia barras que ainda nao existem e dobraria as
    // que o proprio LIKE ia usar. Este caso separa as duas ordens: com
    // escaparPostgrest antes, o resultado teria mais barras que este.
    expect(termoParaOr('a"%b')).toBe('a\\"\\\\%b');
  });

  it("neutraliza aspa e curinga combinados sem perder nenhum", () => {
    expect(termoParaOr('"_"')).toBe('\\"\\\\_\\"');
  });
});
