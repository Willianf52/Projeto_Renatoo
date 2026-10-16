import { describe, expect, it } from "vitest";
import { lerTipoDeResposta, planejarImportacao } from "./importacao";

const existentes = {
  textos: ["Uniforme em ordem?"],
  maiorOrdem: 4,
  grupos: [{ id: 3, nome: "ACE Limpeza" }],
  eventos: [{ id: 9, nome: "Uniforme" }],
};

describe("lerTipoDeResposta", () => {
  it("aceita o codigo, o rotulo da tela e vazio (CNA)", () => {
    expect(lerTipoDeResposta("sn")).toBe("SN");
    expect(lerTipoDeResposta("Conforme / Não conforme")).toBe("CN");
    expect(lerTipoDeResposta("conforme/nao conforme/nao se aplica")).toBe("CNA");
    expect(lerTipoDeResposta("")).toBe("CNA");
    expect(lerTipoDeResposta("Talvez")).toBeNull();
  });
});

describe("planejarImportacao", () => {
  it("entra no fim do checklist, na ordem do arquivo, com grupo e evento pelo nome", () => {
    const plano = planejarImportacao(
      [
        ["Ordem", "Pergunta", "Respostas", "Grupo", "Tipo de Evento", "Status"],
        ["1", "Extintores no prazo?", "CN", "ace limpeza", "UNIFORME", ""],
        ["2", "Portão fechado?", "SN", "", "", "Inativa"],
      ],
      existentes,
    );

    expect(plano.ok && plano.novas).toEqual([
      { ordem: 5, texto: "Extintores no prazo?", tipo_resposta: "CN", grupo_pergunta_id: 3, evento_id: 9, ativo: true },
      { ordem: 6, texto: "Portão fechado?", tipo_resposta: "SN", grupo_pergunta_id: null, evento_id: null, ativo: false },
    ]);
  });

  it("pula a que ja existe no checklist e a repetida no arquivo, sem gastar ordem", () => {
    const plano = planejarImportacao(
      [["Pergunta"], ["uniforme em ORDEM?"], ["Nova"], ["nova"]],
      existentes,
    );
    expect(plano.ok && plano.novas.map((n) => [n.texto, n.ordem])).toEqual([["Nova", 5]]);
    expect(plano.ok && plano.pulados.map((p) => p.motivo)).toEqual(["já existe neste checklist", "repetida no próprio arquivo"]);
  });

  it("recusa grupo, evento, respostas e status desconhecidos, linha a linha", () => {
    const plano = planejarImportacao(
      [
        ["Pergunta", "Respostas", "Grupo", "Tipo de Evento", "Status"],
        ["A", "", "Outro grupo", "", ""],
        ["B", "", "", "Outro evento", ""],
        ["C", "XYZ", "", "", ""],
        ["D", "", "", "", "Talvez"],
        ["", "", "", "", "Ativa"],
      ],
      existentes,
    );
    expect(plano.ok && plano.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5, 6]);
  });

  it("sem a coluna Pergunta, recusa o arquivo inteiro", () => {
    expect(planejarImportacao([["Texto"], ["x"]], existentes).ok).toBe(false);
  });
});
