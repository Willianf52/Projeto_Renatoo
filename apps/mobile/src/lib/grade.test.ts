import { describe, expect, it } from "vitest";

import { colunasParaLargura, larguraDoItemNaGrade } from "./grade";

const MEDIDAS = { respiro: 16, vao: 12 };

describe("colunasParaLargura", () => {
  it("uma coluna no celular, duas a partir de 768", () => {
    expect(colunasParaLargura(360)).toBe(1);
    expect(colunasParaLargura(767)).toBe(1);
    expect(colunasParaLargura(768)).toBe(2);
    expect(colunasParaLargura(1280)).toBe(2);
  });
});

describe("larguraDoItemNaGrade", () => {
  it("numa coluna so, nao fixa largura", () => {
    expect(larguraDoItemNaGrade(412, MEDIDAS)).toBeUndefined();
  });

  it("no tablet em pe, divide a coluna de leitura em duas", () => {
    // 800 de janela -> coluna de 768; 768 - 32 de respiro - 12 de vao = 724.
    expect(larguraDoItemNaGrade(800, MEDIDAS)).toBe(362);
  });

  it("no tablet deitado, a coluna de leitura segura a largura", () => {
    expect(larguraDoItemNaGrade(1280, MEDIDAS)).toBe(362);
  });

  it("arredonda para baixo: dois itens mais o vao nunca passam da linha", () => {
    const largura = larguraDoItemNaGrade(769, { respiro: 16, vao: 13 });
    expect(largura).toBe(361);
    expect((largura ?? 0) * 2 + 13 + 32).toBeLessThanOrEqual(768);
  });
});
