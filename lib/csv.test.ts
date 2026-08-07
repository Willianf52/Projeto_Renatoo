import { describe, expect, it } from "vitest";
import { paraCsv } from "./csv";

describe("paraCsv", () => {
  it("comeca com o BOM UTF-8, para o Excel nao ler acento como Latin-1", () => {
    const csv = paraCsv(["Nome"], [["Cooplivre"]]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("usa ponto e virgula como separador, nao virgula", () => {
    const csv = paraCsv(["A", "B"], [["1", "2"]]);

    expect(csv).toContain('"1";"2"');
  });

  it("dobra aspas internas do campo", () => {
    const csv = paraCsv(["Nome"], [['Site "Central"']]);

    expect(csv).toContain('"Site ""Central"""');
  });

  /**
   * As aspas da RFC 4180 nao protegem disto: o Excel as remove na importacao e
   * so entao decide se a celula e formula. Quem escreve o cadastro nao e quem
   * exporta -- OPERACIONAL grava, GESTOR abre a planilha.
   */
  describe("neutralização de fórmula", () => {
    it.each([
      ["=1+1", "'=1+1"],
      ['=HYPERLINK("http://x","clique")', `'=HYPERLINK("http://x","clique")`],
      ["+1", "'+1"],
      ["-2+3", "'-2+3"],
      ["@SUM(A1)", "'@SUM(A1)"],
      ["\tinjetado", "'\tinjetado"],
    ])("prefixa apostrofo em %j", (entrada, esperado) => {
      const csv = paraCsv(["Nome"], [[entrada]]);

      expect(csv).toContain(`"${esperado.replace(/"/g, '""')}"`);
    });

    it("não mexe em campo que apenas contém = no meio", () => {
      const csv = paraCsv(["Nome"], [["Setor A=B"]]);

      expect(csv).toContain('"Setor A=B"');
      expect(csv).not.toContain("'Setor");
    });

    it("neutraliza também o cabeçalho, que passa pelo mesmo caminho", () => {
      const csv = paraCsv(["=cmd"], [["ok"]]);

      expect(csv).toContain(`"'=cmd"`);
    });

    it("escapa antes de dobrar aspas, sem quebrar o campo", () => {
      const csv = paraCsv(["Nome"], [['="a"']]);

      expect(csv).toContain(`"'=""a"""`);
    });
  });

  it("monta cabecalho e linhas separados por CRLF", () => {
    const csv = paraCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    const semBom = csv.slice(1);

    expect(semBom).toBe('"A";"B"\r\n"1";"2"\r\n"3";"4"\r\n');
  });
});
