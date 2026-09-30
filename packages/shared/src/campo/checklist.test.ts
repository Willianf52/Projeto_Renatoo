import { describe, expect, it } from "vitest";
import {
  caminhoDeMidiaDaVisita,
  esquemaDeChecklistDeVisita,
  linhaDeChecklist,
  linhasDeFoto,
  linhasDeFotoDePergunta,
  linhasDeResposta,
} from "./checklist";
import { LIMITE_MOTIVO, MAXIMO_DE_FOTOS, MAXIMO_DE_FOTOS_POR_PERGUNTA } from "./regras";

const COMUM = {
  visitaId: 42,
  fotos: ["42/foto-1.jpg"],
  assinaturaPath: "42/assinatura.png",
};

const CORRETIVA = { ...COMUM, tipo: "CORRETIVA" as const, motivo: "Portão 3 travado" };
const CONSULTORIA = {
  ...COMUM,
  tipo: "CONSULTORIA" as const,
  modeloId: 7,
  respostas: [{ perguntaId: 1, resposta: "SIM" as const }],
};

function primeiroErro(resultado: { success: false; error: { issues: { message: string }[] } }) {
  return resultado.error.issues[0].message;
}

describe("esquemaDeChecklistDeVisita — corretiva", () => {
  it("aceita motivo, foto e assinatura, aparando as bordas do texto", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CORRETIVA,
      motivo: "  Portão 3 travado  ",
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.tipo === "CORRETIVA" && resultado.data.motivo).toBe(
      "Portão 3 travado",
    );
  });

  it("recusa motivo ausente ou so com espaco", () => {
    for (const motivo of [undefined, "", "   "]) {
      const resultado = esquemaDeChecklistDeVisita.safeParse({ ...CORRETIVA, motivo });

      expect(resultado.success).toBe(false);
      expect(!resultado.success && primeiroErro(resultado)).toContain("motivo da visita");
    }
  });

  it("recusa motivo acima do limite", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CORRETIVA,
      motivo: "x".repeat(LIMITE_MOTIVO + 1),
    });

    expect(resultado.success).toBe(false);
  });
});

describe("esquemaDeChecklistDeVisita — consultoria", () => {
  it("aceita respostas e colapsa observacao vazia em null", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      respostas: [{ perguntaId: 1, resposta: "NA", observacao: "   " }],
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.tipo === "CONSULTORIA" && resultado.data.respostas[0])
      .toEqual({ perguntaId: 1, resposta: "NA", observacao: null });
  });

  it("recusa checklist em branco", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({ ...CONSULTORIA, respostas: [] });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("Responda o checklist");
  });

  it("recusa a mesma pergunta respondida duas vezes", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      respostas: [
        { perguntaId: 1, resposta: "SIM" },
        { perguntaId: 1, resposta: "NAO" },
      ],
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("mais de uma vez");
  });

  it("recusa resposta fora de SIM/NAO/NA", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      respostas: [{ perguntaId: 1, resposta: "TALVEZ" }],
    });

    expect(resultado.success).toBe(false);
  });
});

describe("esquemaDeChecklistDeVisita — o que a uniao impede", () => {
  // A uniao discriminada e o que garante que estes dois estados nunca existam.
  // Sao o mesmo par que o check `checklists_visita_motivo_por_tipo` (0042)
  // recusa no banco -- os testes existem lado a lado de proposito: se um dia
  // alguem afrouxar aqui, o banco ainda barra, e vice-versa.
  it("nao aceita corretiva sem motivo nem consultoria sem respostas", () => {
    expect(esquemaDeChecklistDeVisita.safeParse({ ...COMUM, tipo: "CORRETIVA" }).success).toBe(false);
    expect(esquemaDeChecklistDeVisita.safeParse({ ...COMUM, tipo: "CONSULTORIA" }).success).toBe(false);
  });

  it("nao aceita tipo desconhecido", () => {
    expect(esquemaDeChecklistDeVisita.safeParse({ ...COMUM, tipo: "PREVENTIVA" }).success).toBe(false);
  });
});

describe("esquemaDeChecklistDeVisita — midia", () => {
  it("exige ao menos uma foto e respeita o teto", () => {
    expect(esquemaDeChecklistDeVisita.safeParse({ ...CORRETIVA, fotos: [] }).success).toBe(false);

    const demais = Array.from({ length: MAXIMO_DE_FOTOS + 1 }, (_, i) => `42/foto-${i}.jpg`);
    expect(esquemaDeChecklistDeVisita.safeParse({ ...CORRETIVA, fotos: demais }).success).toBe(false);
  });

  it("recusa caminho sem a pasta da visita — e a chave da policy de storage", () => {
    const semPasta = esquemaDeChecklistDeVisita.safeParse({ ...CORRETIVA, fotos: ["foto.jpg"] });
    expect(semPasta.success).toBe(false);

    const pastaNaoNumerica = esquemaDeChecklistDeVisita.safeParse({
      ...CORRETIVA,
      assinaturaPath: "abc/assinatura.png",
    });
    expect(pastaNaoNumerica.success).toBe(false);
  });
});

describe("caminhoDeMidiaDaVisita", () => {
  it("monta o caminho no formato que a policy de storage espera", () => {
    expect(caminhoDeMidiaDaVisita(42, "a1b2c3", "jpg")).toBe("42/a1b2c3.jpg");
  });

  it("descarta o que nao pode entrar num nome de objeto", () => {
    expect(caminhoDeMidiaDaVisita(7, "../../etc/passwd", "png")).toBe("7/etcpasswd.png");
  });
});

describe("pontes com o banco", () => {
  it("grava motivo na corretiva e null explicito na consultoria", () => {
    const corretiva = esquemaDeChecklistDeVisita.parse(CORRETIVA);
    const consultoria = esquemaDeChecklistDeVisita.parse(CONSULTORIA);

    expect(linhaDeChecklist(corretiva)).toEqual({
      visita_id: 42,
      tipo: "CORRETIVA",
      motivo: "Portão 3 travado",
      assinatura_path: "42/assinatura.png",
      modelo_id: null,
    });

    // `null`, e nao ausente: a chave precisa existir para o check do banco ver.
    expect(linhaDeChecklist(consultoria)).toHaveProperty("motivo", null);
    expect(linhaDeChecklist(consultoria)).toHaveProperty("modelo_id", 7);
    expect(linhaDeChecklist(corretiva)).toHaveProperty("modelo_id", null);
  });

  it("amarra respostas e fotos ao checklist recem-criado", () => {
    const consultoria = esquemaDeChecklistDeVisita.parse(CONSULTORIA);

    expect(
      consultoria.tipo === "CONSULTORIA" ? linhasDeResposta(consultoria.respostas, 99) : [],
    ).toEqual([{ checklist_id: 99, pergunta_id: 1, resposta: "SIM", observacao: null }]);

    expect(linhasDeFoto(consultoria.fotos, 99)).toEqual([
      { checklist_id: 99, storage_path: "42/foto-1.jpg" },
    ]);

    expect(linhasDeFotoDePergunta([{ perguntaId: 1, caminho: "42/foto-p1.jpg" }], 99)).toEqual([
      { checklist_id: 99, storage_path: "42/foto-p1.jpg", pergunta_id: 1 },
    ]);
  });
});

describe("esquemaDeChecklistDeVisita — modelo e foto por pergunta (0061)", () => {
  it("recusa consultoria sem modelo", () => {
    const { modeloId: _semModelo, ...semModelo } = CONSULTORIA;
    const resultado = esquemaDeChecklistDeVisita.safeParse(semModelo);

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("modelo do checklist");
  });

  it("aceita consultoria so com foto de pergunta -- ela ja comprova a visita", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      fotos: [],
      fotosDePergunta: [{ perguntaId: 1, caminho: "42/foto-p1.jpg" }],
    });

    expect(resultado.success).toBe(true);
  });

  it("sem foto nenhuma, geral ou de pergunta, recusa", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({ ...CONSULTORIA, fotos: [] });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toBe("Anexe ao menos uma foto.");
  });

  it("corretiva sem foto continua recusada", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({ ...CORRETIVA, fotos: [] });

    expect(resultado.success).toBe(false);
  });

  it("recusa foto de pergunta que nao foi respondida", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      fotosDePergunta: [{ perguntaId: 99, caminho: "42/foto-p99.jpg" }],
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("não está no checklist");
  });

  it("recusa foto de pergunta acima do teto por pergunta", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      fotosDePergunta: Array.from({ length: MAXIMO_DE_FOTOS_POR_PERGUNTA + 1 }, (_, indice) => ({
        perguntaId: 1,
        caminho: `42/foto-p1-${indice}.jpg`,
      })),
    });

    expect(resultado.success).toBe(false);
    expect(!resultado.success && primeiroErro(resultado)).toContain("por pergunta");
  });

  it("recusa caminho de foto de pergunta fora do formato", () => {
    const resultado = esquemaDeChecklistDeVisita.safeParse({
      ...CONSULTORIA,
      fotosDePergunta: [{ perguntaId: 1, caminho: "sem-pasta.jpg" }],
    });

    expect(resultado.success).toBe(false);
  });
});
