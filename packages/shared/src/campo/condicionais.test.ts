import { describe, expect, it } from "vitest";
import { ordenarPerguntas, perguntaVisivel, perguntasVisiveis } from "./condicionais";

const comum = (id: number, grupo: string | null = null) => ({ id, grupo });
const condicional = (id: number, base: number, gatilho: string, grupo: string | null = null) => ({
  id,
  grupo,
  perguntaBaseId: base,
  respostaGatilho: gatilho,
});

describe("pergunta condicional", () => {
  it("a comum sempre aparece", () => {
    expect(perguntaVisivel(comum(1), {})).toBe(true);
  });

  it("a condicional so aparece com a resposta-gatilho da base", () => {
    const p = condicional(2, 1, "NAO");
    expect(perguntaVisivel(p, {})).toBe(false);
    expect(perguntaVisivel(p, { 1: "SIM" })).toBe(false);
    expect(perguntaVisivel(p, { 1: "NAO" })).toBe(true);
  });

  it("filtra a lista mantendo a ordem", () => {
    const lista = [comum(1), condicional(2, 1, "NAO"), comum(3)];
    expect(perguntasVisiveis(lista, { 1: "SIM" }).map((p) => p.id)).toEqual([1, 3]);
    expect(perguntasVisiveis(lista, { 1: "NAO" }).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe("ordem aleatoria", () => {
  const lista = [comum(1), condicional(2, 1, "NAO"), comum(3), comum(4), comum(5), comum(6), comum(7)];

  it("sem aleatoria, devolve a ordem do cadastro", () => {
    expect(ordenarPerguntas(lista, false, "x").map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("a mesma inspecao ve sempre a mesma ordem, e nao perde nem repete pergunta", () => {
    const a = ordenarPerguntas(lista, true, 123).map((p) => p.id);
    const b = ordenarPerguntas(lista, true, 123).map((p) => p.id);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("outra inspecao costuma ver outra ordem", () => {
    const ordens = new Set(
      Array.from({ length: 20 }, (_, i) => ordenarPerguntas(lista, true, i).map((p) => p.id).join(",")),
    );
    expect(ordens.size).toBeGreaterThan(1);
  });

  it("a condicional vem logo depois da base", () => {
    for (let semente = 0; semente < 30; semente++) {
      const ids = ordenarPerguntas(lista, true, semente).map((p) => p.id);
      expect(ids[ids.indexOf(1) + 1]).toBe(2);
    }
  });

  it("embaralha dentro do grupo, com os grupos na ordem em que aparecem", () => {
    const comGrupos = [comum(1, "A"), comum(2, "A"), comum(3, "A"), comum(4, "B"), comum(5, "B")];
    for (let semente = 0; semente < 20; semente++) {
      const ids = ordenarPerguntas(comGrupos, true, semente).map((p) => p.id);
      expect(ids.slice(0, 3).sort()).toEqual([1, 2, 3]);
      expect(ids.slice(3).sort()).toEqual([4, 5]);
    }
  });
});
