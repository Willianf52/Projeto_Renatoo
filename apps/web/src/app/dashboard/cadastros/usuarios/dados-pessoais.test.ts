import { describe, expect, it } from "vitest";
import {
  cpfValido,
  erroDosDadosPessoais,
  formatarCpf,
  formatarTelefone,
  paraGravar,
  DADOS_PESSOAIS_VAZIOS,
} from "./dados-pessoais";

describe("cpfValido", () => {
  it("confere os dois digitos verificadores", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("52998224715")).toBe(false);
  });

  it("recusa sequencia repetida e tamanho errado", () => {
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("5299822472")).toBe(false);
  });
});

describe("erroDosDadosPessoais", () => {
  it("tudo em branco e valido", () => {
    expect(erroDosDadosPessoais(DADOS_PESSOAIS_VAZIOS)).toBeNull();
  });

  it("aceita com ou sem pontuacao", () => {
    expect(
      erroDosDadosPessoais({ cpf: "529.982.247-25", re: "77", telefone: "(11) 3333-4444", celular: "11987654321" }),
    ).toBeNull();
  });

  it("cada campo tem a sua mensagem", () => {
    expect(erroDosDadosPessoais({ ...DADOS_PESSOAIS_VAZIOS, cpf: "123" })).toBe("CPF inválido.");
    expect(erroDosDadosPessoais({ ...DADOS_PESSOAIS_VAZIOS, re: "x".repeat(31) })).toBe(
      "O RE deve ter no máximo 30 caracteres.",
    );
    expect(erroDosDadosPessoais({ ...DADOS_PESSOAIS_VAZIOS, celular: "9876-5432" })).toMatch(/^Celular inválido/);
    expect(erroDosDadosPessoais({ ...DADOS_PESSOAIS_VAZIOS, telefone: "123" })).toMatch(/^Telefone inválido/);
  });
});

describe("paraGravar e formatacao", () => {
  it("so digitos, e vazio vira nulo", () => {
    expect(paraGravar({ cpf: "529.982.247-25", re: "  ", telefone: "", celular: "(11) 98765-4321" })).toEqual({
      cpf: "52998224725",
      re: null,
      telefone: null,
      celular: "11987654321",
    });
  });

  it("formata para a tela", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(formatarCpf(null)).toBe("");
  });
});
