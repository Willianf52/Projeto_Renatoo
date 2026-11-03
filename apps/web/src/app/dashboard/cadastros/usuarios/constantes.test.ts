import { describe, expect, it } from "vitest";
import { TIPO_PADRAO, valoresParaDuplicar, VALORES_VAZIOS } from "./constantes";

const MODELO = {
  funcao: "Supervisor Operacional",
  cargo: "SUPERVISOR",
  tipo: "PADRAO",
  superior_id: "11111111-1111-1111-1111-111111111111",
  ativo: false,
};

describe("valoresParaDuplicar", () => {
  it("copia o perfil de acesso da conta de origem", () => {
    const valores = valoresParaDuplicar(MODELO, ["7", "9"]);

    expect(valores).toMatchObject({
      funcao: "Supervisor Operacional",
      cargo: "SUPERVISOR",
      tipo: "PADRAO",
      superiorId: "11111111-1111-1111-1111-111111111111",
      gruposDoCliente: ["7", "9"],
    });
  });

  it("copia a situacao, inclusive quando a origem esta inativa", () => {
    // Duplicar uma conta desativada e o jeito de preparar o acesso de alguem
    // que ainda nao entrou -- nascer ativa mudaria o que foi pedido.
    expect(valoresParaDuplicar(MODELO, []).ativo).toBe(false);
  });

  it("NAO copia e-mail, senha nem dados pessoais", () => {
    const valores = valoresParaDuplicar(MODELO, ["7"]);

    // O e-mail e unico na conta de autenticacao: copiado, viraria recusa no
    // envio. CPF, R.E. e telefones sao de outra pessoa.
    expect(valores.email).toBe("");
    expect(valores.senha).toBe("");
    expect(valores.cpf).toBe("");
    expect(valores.celular).toBe("");
  });

  it("cópia completa do antigo: nome com ' cópia', login com '_copia' e as caixas de e-mail", () => {
    const valores = valoresParaDuplicar(
      { ...MODELO, nome_completo: "Maria Souza", login: "maria", email_superior_evento: true },
      [],
    );
    expect(valores.nomeCompleto).toBe("Maria Souza cópia");
    expect(valores.login).toBe("maria_copia");
    expect(valores.emailSuperiorEvento).toBe(true);
    expect(valores.emailSuperiorChecklist).toBe(false);
  });

  it("sem nome ou login na origem, os campos ficam em branco", () => {
    const valores = valoresParaDuplicar(MODELO, []);
    expect(valores.nomeCompleto).toBe("");
    expect(valores.login).toBe("");
  });

  it("sem modelo, devolve o formulario em branco", () => {
    expect(valoresParaDuplicar(null, [])).toEqual(VALORES_VAZIOS);
    expect(valoresParaDuplicar(null, []).cargo).toBe("OPERADOR");
    expect(valoresParaDuplicar(null, []).tipo).toBe(TIPO_PADRAO);
  });

  it("devolve objeto novo, sem compartilhar o array de grupos com o padrao", () => {
    const valores = valoresParaDuplicar(null, []);
    valores.gruposDoCliente.push("99");

    expect(VALORES_VAZIOS.gruposDoCliente).toEqual([]);
  });

  it("funcao ausente na origem vira string vazia, nao 'null' escrito na tela", () => {
    expect(valoresParaDuplicar({ ...MODELO, funcao: null, superior_id: null }, []).funcao).toBe("");
    expect(valoresParaDuplicar({ ...MODELO, funcao: null, superior_id: null }, []).superiorId).toBe("");
  });
});
