import { describe, expect, it } from "vitest";
import {
  modelosDoGrupo,
  notaDoChecklist,
  respostasDoTipo,
  rotuloDaResposta,
  tipoDeResposta,
  type ModeloResumido,
} from "./modelos";

describe("tipoDeResposta", () => {
  it("aceita os tres tipos da 0061", () => {
    expect(tipoDeResposta("CNA")).toBe("CNA");
    expect(tipoDeResposta("CN")).toBe("CN");
    expect(tipoDeResposta("SN")).toBe("SN");
  });

  it("cai no CNA com valor desconhecido ou ausente -- o tipo de toda pergunta antiga", () => {
    expect(tipoDeResposta("XYZ")).toBe("CNA");
    expect(tipoDeResposta(null)).toBe("CNA");
    expect(tipoDeResposta(undefined)).toBe("CNA");
  });
});

describe("respostasDoTipo", () => {
  it("so o CNA oferece Nao se aplica", () => {
    expect(respostasDoTipo("CNA")).toEqual(["SIM", "NAO", "NA"]);
    expect(respostasDoTipo("CN")).toEqual(["SIM", "NAO"]);
    expect(respostasDoTipo("SN")).toEqual(["SIM", "NAO"]);
  });
});

describe("rotuloDaResposta", () => {
  it("le SIM como Conforme numa pergunta de conformidade", () => {
    expect(rotuloDaResposta("CNA", "SIM")).toBe("Conforme");
    expect(rotuloDaResposta("CN", "NAO")).toBe("Não conforme");
    expect(rotuloDaResposta("CNA", "NA")).toBe("Não se aplica");
  });

  it("le SIM como Sim numa pergunta Sim/Nao", () => {
    expect(rotuloDaResposta("SN", "SIM")).toBe("Sim");
    expect(rotuloDaResposta("SN", "NAO")).toBe("Não");
  });
});

describe("notaDoChecklist", () => {
  it("e a fatia de Conforme entre as perguntas de conformidade", () => {
    expect(
      notaDoChecklist([
        { tipo: "CNA", resposta: "SIM" },
        { tipo: "CNA", resposta: "SIM" },
        { tipo: "CN", resposta: "SIM" },
        { tipo: "CNA", resposta: "NAO" },
      ]),
    ).toBe(75);
  });

  it("ignora Nao se aplica e as perguntas Sim/Nao", () => {
    expect(
      notaDoChecklist([
        { tipo: "CNA", resposta: "SIM" },
        { tipo: "CNA", resposta: "NA" },
        { tipo: "SN", resposta: "NAO" },
        { tipo: "SN", resposta: "SIM" },
      ]),
    ).toBe(100);
  });

  it("arredonda para inteiro", () => {
    expect(
      notaDoChecklist([
        { tipo: "CNA", resposta: "SIM" },
        { tipo: "CNA", resposta: "SIM" },
        { tipo: "CNA", resposta: "NAO" },
      ]),
    ).toBe(67);
  });

  it("e nula quando nao sobra nada para medir -- zero diria que algo foi reprovado", () => {
    expect(notaDoChecklist([])).toBeNull();
    expect(notaDoChecklist([{ tipo: "CNA", resposta: "NA" }])).toBeNull();
    expect(notaDoChecklist([{ tipo: "SN", resposta: "NAO" }])).toBeNull();
  });
});

describe("modelosDoGrupo", () => {
  const PADRAO: ModeloResumido = { id: 1, nome: "Padrão", padrao: true, ativo: true };
  const GERAL: ModeloResumido = { id: 2, nome: "Condomínio - Geral", padrao: false, ativo: true };
  const LIMPEZA: ModeloResumido = { id: 3, nome: "Condomínio - Limpeza", padrao: false, ativo: true };
  const DESLIGADO: ModeloResumido = { id: 4, nome: "Antigo", padrao: false, ativo: false };
  const MODELOS = [LIMPEZA, PADRAO, DESLIGADO, GERAL];

  it("devolve os modelos ligados ao grupo, por nome", () => {
    const ligacoes = [
      { modelo_id: 3, grupo_site_id: 10 },
      { modelo_id: 2, grupo_site_id: 10 },
      { modelo_id: 2, grupo_site_id: 20 },
    ];

    expect(modelosDoGrupo(10, MODELOS, ligacoes)).toEqual([GERAL, LIMPEZA]);
  });

  it("usa o padrao quando o grupo nao tem modelo", () => {
    expect(modelosDoGrupo(30, MODELOS, [{ modelo_id: 2, grupo_site_id: 10 }])).toEqual([PADRAO]);
  });

  it("modelo desligado nao conta -- grupo so com ele cai no padrao", () => {
    expect(modelosDoGrupo(10, MODELOS, [{ modelo_id: 4, grupo_site_id: 10 }])).toEqual([PADRAO]);
  });

  it("fica vazio se nem o padrao veio -- a tela trata como falha de leitura", () => {
    expect(modelosDoGrupo(10, [GERAL], [])).toEqual([]);
  });
});
