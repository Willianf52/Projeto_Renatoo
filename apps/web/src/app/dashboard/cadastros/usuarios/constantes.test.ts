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

  it("NAO copia o que identifica a pessoa", () => {
    const valores = valoresParaDuplicar(MODELO, ["7"]);

    // O e-mail e unico na conta de autenticacao: copiado, viraria recusa no
    // envio. Os demais sao a identidade de quem vai usar a conta nova.
    expect(valores.nomeCompleto).toBe("");
    expect(valores.email).toBe("");
    expect(valores.login).toBe("");
    expect(valores.senha).toBe("");
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
