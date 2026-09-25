import { describe, expect, it } from "vitest";
import { lerCsv, paraCsv } from "./csv";

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

describe("lerCsv", () => {
  it("le de volta exatamente o que paraCsv escreveu", () => {
    const linhas = [
      ["1", "Norte; Sul", "Ativo", 'Tem "aspas" e\nquebra de linha'],
      ["2", "-Filial", "Inativo", "=HYPERLINK()"],
    ];

    expect(lerCsv(paraCsv(["ID", "Nome", "Status", "Descrição"], linhas))).toEqual([
      ["ID", "Nome", "Status", "Descrição"],
      ...linhas,
    ]);
  });

  it("aceita virgula quando o cabecalho vem com virgula", () => {
    expect(lerCsv("Nome,Descrição\nA,B\n")).toEqual([
      ["Nome", "Descrição"],
      ["A", "B"],
    ]);
  });

  it("aceita campo sem aspas, LF puro e sem BOM -- como o Excel regrava", () => {
    expect(lerCsv("Nome;Status\nGrupo A;Ativo")).toEqual([
      ["Nome", "Status"],
      ["Grupo A", "Ativo"],
    ]);
  });

  it("mantem linha vazia do meio, para o numero da linha bater com a planilha", () => {
    expect(lerCsv("Nome\nA\n\nB\n")).toEqual([["Nome"], ["A"], [""], ["B"]]);
  });

  it("descarta as linhas vazias do fim, que o Excel deixa", () => {
    expect(lerCsv("Nome;Status\r\nA;Ativo\r\n;\r\n\r\n")).toEqual([
      ["Nome", "Status"],
      ["A", "Ativo"],
    ]);
  });

  it("so tira o apostrofo que protege formula, nao um apostrofo de verdade", () => {
    expect(lerCsv("Nome\n'Dona Ana's\n")).toEqual([["Nome"], ["'Dona Ana's"]]);
  });
});
