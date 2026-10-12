import { describe, expect, it, vi } from "vitest";

vi.mock("../campo/fila", () => ({ abrirFila: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: {} }));

const { agruparPerguntas, copiaValida, modelosNaCopia, perguntasNaCopia } = await import("./checklist-guardado");

const copia = {
  gruposDosSites: { "30": 7, "31": 8 },
  modelos: [
    { id: 1, nome: "Padrão", padrao: true, ativo: true },
    { id: 2, nome: "Limpeza", padrao: false, ativo: true },
    { id: 3, nome: "Desativado", padrao: false, ativo: false },
  ],
  ligacoes: [
    { modelo_id: 2, grupo_site_id: 7 },
    { modelo_id: 3, grupo_site_id: 8 },
  ],
  perguntas: { "2": [{ id: 10, ordem: 1, texto: "Uniforme", tipoResposta: "CNA" as const }] },
};

describe("modelosNaCopia", () => {
  it("usa o modelo ligado ao grupo do site", () => {
    expect(modelosNaCopia(copia, 30).map((m) => m.id)).toEqual([2]);
  });

  it("grupo so com modelo desativado cai no padrao, como no servidor", () => {
    expect(modelosNaCopia(copia, 31).map((m) => m.id)).toEqual([1]);
  });

  it("site fora da copia nao inventa modelo", () => {
    expect(modelosNaCopia(copia, 99)).toEqual([]);
  });
});

describe("perguntasNaCopia", () => {
  it("devolve as perguntas guardadas do modelo, ou nada", () => {
    expect(perguntasNaCopia(copia, 2)).toHaveLength(1);
    expect(perguntasNaCopia(copia, 1)).toEqual([]);
  });
});

describe("agruparPerguntas", () => {
  it("separa por modelo e poe na ordem", () => {
    const porModelo = agruparPerguntas([
      { id: 2, modelo_id: 5, ordem: 2, texto: "B", tipo_resposta: "SN" },
      { id: 1, modelo_id: 5, ordem: 1, texto: "A", tipo_resposta: "CNA" },
      { id: 3, modelo_id: 6, ordem: 1, texto: "C", tipo_resposta: "estranho" },
    ]);
    expect(porModelo["5"].map((p) => p.texto)).toEqual(["A", "B"]);
    expect(porModelo["6"][0].tipoResposta).toBe("CNA");
  });
});

describe("copiaValida", () => {
  it("aceita a forma certa e recusa o resto", () => {
    expect(copiaValida(copia)).not.toBeNull();
    expect(copiaValida(null)).toBeNull();
    expect(copiaValida({ ...copia, modelos: "x" })).toBeNull();
    expect(copiaValida({ ...copia, gruposDosSites: null })).toBeNull();
  });
});
