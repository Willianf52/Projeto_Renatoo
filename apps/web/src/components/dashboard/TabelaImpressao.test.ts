import { describe, expect, it } from "vitest";

import { cssDaFolha, textoDoPeriodo } from "./TabelaImpressao";

describe("textoDoPeriodo", () => {
  it("as duas datas, como no cabecalho do antigo", () => {
    expect(textoDoPeriodo("2026-10-01", "2026-10-30")).toBe("PERÍODO: 01/10/2026 ATÉ 30/10/2026");
  });

  it("so uma das datas", () => {
    expect(textoDoPeriodo("2026-10-01", undefined)).toBe("PERÍODO: A PARTIR DE 01/10/2026");
    expect(textoDoPeriodo(undefined, "2026-10-30")).toBe("PERÍODO: ATÉ 30/10/2026");
  });

  it("sem datas, sem linha de periodo", () => {
    expect(textoDoPeriodo()).toBeNull();
  });
});

describe("cssDaFolha", () => {
  it("poe a emissao e a paginacao no rodape de cada folha", () => {
    const css = cssDaFolha("30/10/2026 - 10:43");
    expect(css).toContain('@bottom-left { content: "30/10/2026 - 10:43";');
    expect(css).toContain('@bottom-center { content: counter(page) " de " counter(pages);');
  });

  /** Sem as caixas do topo, o Chrome imprimia la o cabecalho dele (data e
   * titulo da aba), visto no PDF de 30/10/2026. */
  it("ocupa o topo da folha para o Chrome nao por o cabecalho dele", () => {
    const css = cssDaFolha("x");
    expect(css).toContain('@top-left { content: " "; }');
    expect(css).toContain('@top-center { content: " "; }');
    expect(css).toContain('@top-right { content: " "; }');
  });

  /** A orientacao fica com quem imprime: relatorio largo sai melhor deitado. */
  it("nao fixa o tamanho nem a orientacao da folha", () => {
    expect(cssDaFolha("x")).not.toContain("size");
  });

  /** O PDF do Historico de Checklist do antigo sai deitado. */
  it("com paisagem, a folha ja sai deitada", () => {
    expect(cssDaFolha("x", true)).toContain("size: A4 landscape;");
  });

  it("texto nao escapa da string do CSS", () => {
    // Entrada: a"b\c + quebra de linha + d. Saida: aspas e barra escapadas, quebra virando espaco.
    expect(cssDaFolha(String.raw`a"b\c` + "\nd")).toContain(String.raw`content: "a\"b\\c d";`);
  });
});
