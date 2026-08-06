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

  it("monta cabecalho e linhas separados por CRLF", () => {
    const csv = paraCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    const semBom = csv.slice(1);

    expect(semBom).toBe('"A";"B"\r\n"1";"2"\r\n"3";"4"\r\n');
  });
});
