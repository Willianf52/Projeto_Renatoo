import { describe, expect, it } from "vitest";

import {
  pendenciasDoChecklist,
  progressoDasPerguntas,
  textoDoResumo,
  type EstadoDoChecklist,
} from "./pendencias-do-checklist";

const perguntas = [{ id: 11 }, { id: 12 }, { id: 13 }];

function estado(parcial: Partial<EstadoDoChecklist>): EstadoDoChecklist {
  return {
    tipo: "CORRETIVA",
    motivo: "Porta sem trava",
    perguntas: null,
    respostas: {},
    quantidadeDeFotos: 1,
    assinaturasColhidas: 2,
    ...parcial,
  };
}

describe("pendenciasDoChecklist", () => {
  it("corretiva completa nao tem pendencia", () => {
    expect(pendenciasDoChecklist(estado({}))).toEqual([]);
  });

  it("lista tudo o que falta na ordem da tela", () => {
    const pendencias = pendenciasDoChecklist(
      estado({ motivo: "   ", quantidadeDeFotos: 0, assinaturasColhidas: 0 }),
    );

    expect(pendencias.map((p) => p.alvo)).toEqual(["motivo", "fotos", "assinatura"]);
  });

  it("mantem as mensagens que o envio ja mostrava", () => {
    const pendencias = pendenciasDoChecklist(
      estado({ motivo: "", quantidadeDeFotos: 0, assinaturasColhidas: 0 }),
    );

    expect(pendencias.map((p) => p.mensagem)).toEqual([
      "Informe o motivo da visita.",
      "Anexe ao menos uma foto.",
      "Colha as 2 assinaturas.",
    ]);
  });

  /** Checklist dos carros: uma assinatura so (0092, 04/11/2026). */
  describe("modelo que exige uma assinatura", () => {
    it("sem assinatura, falta a assinatura (no singular)", () => {
      const pendencias = pendenciasDoChecklist(estado({ assinaturasColhidas: 0, assinaturasExigidas: 1 }));

      expect(pendencias).toEqual([{ alvo: "assinatura", mensagem: "Colha a assinatura.", umaSo: true }]);
      expect(textoDoResumo(pendencias)).toBe("Falta: a assinatura.");
    });

    it("com uma assinatura, nao falta nada", () => {
      expect(pendenciasDoChecklist(estado({ assinaturasColhidas: 1, assinaturasExigidas: 1 }))).toEqual([]);
    });
  });

  /** "Obrigatorio" do sistema antigo (0099, 13/11/2026): a nao obrigatoria pode ficar em branco. */
  describe("pergunta nao obrigatoria", () => {
    const comOpcional = [{ id: 11 }, { id: 12, obrigatoria: false }, { id: 13 }];

    it("em branco nao e pendencia", () => {
      expect(
        pendenciasDoChecklist(
          estado({ tipo: "CONSULTORIA", perguntas: comOpcional, respostas: { 11: "SIM", 13: "NAO" } }),
        ),
      ).toEqual([]);
    });

    it("as obrigatorias continuam cobradas, e a contagem ignora a opcional", () => {
      const [pendencia] = pendenciasDoChecklist(
        estado({ tipo: "CONSULTORIA", perguntas: comOpcional, respostas: { 11: "SIM" } }),
      );
      expect(pendencia).toMatchObject({ alvo: "perguntas", perguntaId: 13, faltam: 1 });
    });

    it("com foto obrigatoria no modelo, a opcional em branco nao pede foto", () => {
      expect(
        pendenciasDoChecklist(
          estado({
            tipo: "CONSULTORIA",
            perguntas: comOpcional,
            respostas: { 11: "SIM", 13: "SIM" },
            fotoObrigatoriaPorPergunta: true,
            fotosPorPergunta: { 11: 1, 13: 1 },
          }),
        ),
      ).toEqual([]);
    });
  });

  /** Checklist dos carros: foto em TODAS as perguntas (0091, 04/11/2026). */
  describe("modelo com foto obrigatoria em todas as perguntas", () => {
    const respondidas = { 11: "SIM", 12: "SIM", 13: "SIM" } as const;
    const base = () =>
      estado({
        tipo: "CONSULTORIA",
        perguntas,
        respostas: respondidas,
        quantidadeDeFotos: 0,
        fotoObrigatoriaPorPergunta: true,
      });

    it("pergunta sem foto fica pendente, apontando a primeira", () => {
      const [pendencia] = pendenciasDoChecklist({ ...base(), fotosPorPergunta: { 11: 1 } });

      expect(pendencia).toMatchObject({ alvo: "perguntas", perguntaId: 12, faltam: 2, foto: true });
      expect(pendencia.mensagem).toContain("Anexe foto em todas as perguntas");
    });

    it("com foto em todas, nao ha pendencia", () => {
      expect(pendenciasDoChecklist({ ...base(), fotosPorPergunta: { 11: 1, 12: 3, 13: 1 } })).toEqual([]);
    });

    it("sem a opcao ligada, a foto continua opcional", () => {
      expect(
        pendenciasDoChecklist({ ...base(), fotoObrigatoriaPorPergunta: false, fotosPorPergunta: {} }),
      ).toEqual([]);
    });

    it("primeiro as respostas: foto so e cobrada de quem ja respondeu tudo", () => {
      const [pendencia] = pendenciasDoChecklist({ ...base(), respostas: { 11: "SIM" }, fotosPorPergunta: {} });

      expect(pendencia).toMatchObject({ alvo: "perguntas", perguntaId: 12 });
      expect(pendencia).not.toHaveProperty("foto");
    });

    it("o resumo do rodape diz que faltam fotos", () => {
      expect(textoDoResumo(pendenciasDoChecklist({ ...base(), fotosPorPergunta: { 11: 1 } }))).toBe(
        "Falta: foto em 2 perguntas.",
      );
    });
  });

  /** O checklist exige as DUAS assinaturas, cada uma com nome (04/11/2026). */
  it("com uma so assinatura, ainda falta a segunda", () => {
    const pendencias = pendenciasDoChecklist(estado({ assinaturasColhidas: 1 }));

    expect(pendencias.map((p) => p.alvo)).toEqual(["assinatura"]);
    expect(pendencias[0].mensagem).toBe("Falta 1 assinatura.");
  });

  it("com as duas assinaturas, nao ha pendencia de assinatura", () => {
    expect(pendenciasDoChecklist(estado({ assinaturasColhidas: 2 }))).toEqual([]);
  });

  it("corretiva ignora perguntas; consultoria ignora motivo", () => {
    expect(pendenciasDoChecklist(estado({ perguntas, respostas: {} }))).toEqual([]);
    expect(
      pendenciasDoChecklist(
        estado({ tipo: "CONSULTORIA", motivo: "", perguntas, respostas: { 11: "SIM", 12: "NAO", 13: "NA" } }),
      ),
    ).toEqual([]);
  });

  it("aponta a primeira pergunta sem resposta e conta as que faltam", () => {
    const [pendencia] = pendenciasDoChecklist(
      estado({ tipo: "CONSULTORIA", perguntas, respostas: { 11: "SIM" } }),
    );

    expect(pendencia).toEqual({
      alvo: "perguntas",
      perguntaId: 12,
      faltam: 2,
      mensagem: "Responda todas as perguntas (faltam 2).",
    });
  });

  it("perguntas ainda carregando nao viram 'nenhuma cadastrada'", () => {
    const [pendencia] = pendenciasDoChecklist(estado({ tipo: "CONSULTORIA", perguntas: null }));

    expect(pendencia).toMatchObject({
      alvo: "perguntas",
      perguntaId: null,
      faltam: null,
      mensagem: "Aguarde as perguntas do checklist carregarem.",
    });
  });

  it("lista vazia continua recusando o envio", () => {
    const [pendencia] = pendenciasDoChecklist(estado({ tipo: "CONSULTORIA", perguntas: [] }));

    expect(pendencia).toMatchObject({
      alvo: "perguntas",
      faltam: null,
      mensagem: "Nenhuma pergunta cadastrada no checklist.",
    });
  });
});

describe("progressoDasPerguntas", () => {
  it("conta as respondidas sobre o total", () => {
    expect(
      progressoDasPerguntas(estado({ tipo: "CONSULTORIA", perguntas, respostas: { 11: "SIM", 13: "NA" } })),
    ).toEqual({ respondidas: 2, total: 3 });
  });

  it("nao existe fora da consultoria nem sem lista", () => {
    expect(progressoDasPerguntas(estado({ perguntas }))).toBeNull();
    expect(progressoDasPerguntas(estado({ tipo: "CONSULTORIA", perguntas: null }))).toBeNull();
    expect(progressoDasPerguntas(estado({ tipo: "CONSULTORIA", perguntas: [] }))).toBeNull();
  });
});

describe("textoDoResumo", () => {
  it("diz que esta pronto quando nao falta nada", () => {
    expect(textoDoResumo([])).toBe("Tudo pronto para enviar.");
  });

  it("junta as pecas com virgula e 'e' no fim", () => {
    const pendencias = pendenciasDoChecklist(
      estado({ tipo: "CORRETIVA", motivo: "", quantidadeDeFotos: 0, assinaturasColhidas: 0 }),
    );

    expect(textoDoResumo(pendencias)).toBe("Falta: o motivo, uma foto e as assinaturas.");
  });

  it("consultoria nao exige foto: so as perguntas e a assinatura (03/11/2026)", () => {
    const pendencias = pendenciasDoChecklist(
      estado({ tipo: "CONSULTORIA", perguntas, respostas: {}, quantidadeDeFotos: 0, assinaturasColhidas: 0 }),
    );

    expect(textoDoResumo(pendencias)).toBe("Falta: 3 perguntas e as assinaturas.");
  });

  it("singular para uma pergunta, e uma peca so sem 'e'", () => {
    const pendencias = pendenciasDoChecklist(
      estado({ tipo: "CONSULTORIA", perguntas, respostas: { 11: "SIM", 12: "SIM" } }),
    );

    expect(textoDoResumo(pendencias)).toBe("Falta: 1 pergunta.");
  });

  it("sem lista para contar, fala das perguntas sem numero", () => {
    const pendencias = pendenciasDoChecklist(estado({ tipo: "CONSULTORIA", perguntas: null }));

    expect(textoDoResumo(pendencias)).toBe("Falta: as perguntas.");
  });
});

describe("escolha do modelo (0061)", () => {
  it("pede a escolha antes de pedir as perguntas", () => {
    const [pendencia] = pendenciasDoChecklist({
      tipo: "CONSULTORIA",
      motivo: "",
      perguntas: null,
      respostas: {},
      escolhaDeModeloPendente: true,
      quantidadeDeFotos: 1,
      assinaturasColhidas: 2,
    });

    expect(pendencia).toMatchObject({ alvo: "perguntas", mensagem: "Escolha qual checklist responder." });
  });

  it("nao vale na corretiva, que nao tem modelo", () => {
    expect(
      pendenciasDoChecklist({
        tipo: "CORRETIVA",
        motivo: "Portão",
        perguntas: null,
        respostas: {},
        escolhaDeModeloPendente: true,
        quantidadeDeFotos: 1,
        assinaturasColhidas: 2,
      }),
    ).toEqual([]);
  });
});

describe("mínimo da descrição do Não conforme (Cadastros > Cliente, 0086)", () => {
  const comTipos = [
    { id: 11, ordem: 1, tipoResposta: "CNA" },
    { id: 12, ordem: 2, tipoResposta: "SN" },
  ];
  const base = { tipo: "CONSULTORIA" as const, perguntas: comTipos, respostas: { 11: "NAO", 12: "NAO" } };

  it("observação curta num Não conforme vira pendência, apontando a pergunta", () => {
    const pendencias = pendenciasDoChecklist(estado({ ...base, observacoes: { 11: "sujo" }, minimoDaObservacao: 10 }));
    expect(pendencias[0]).toMatchObject({ alvo: "perguntas", perguntaId: 11 });
    expect(pendencias[0].mensagem).toContain("pergunta 1");
  });

  it("sem mínimo, ou com a observação longa, não pede nada; Sim/Não não conta", () => {
    expect(pendenciasDoChecklist(estado({ ...base, observacoes: {}, minimoDaObservacao: 0 }))).toEqual([]);
    expect(
      pendenciasDoChecklist(estado({ ...base, observacoes: { 11: "Piso sujo na portaria" }, minimoDaObservacao: 10 })),
    ).toEqual([]);
  });
});
