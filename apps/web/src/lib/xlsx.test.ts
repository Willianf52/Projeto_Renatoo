import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { crc32, escaparXml, letraDaColuna, paraXlsx, zipSemCompressao } from "./xlsx";

/** Le de volta um ZIP "stored" pelo diretorio central: nome -> conteudo em texto. */
function lerZip(zip: Uint8Array): Map<string, string> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fim = zip.length - 22;
  expect(dv.getUint32(fim, true)).toBe(0x06054b50);
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const arquivos = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const metodo = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const tamanho = dv.getUint32(p + 20, true);
    const nomeTam = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(zip.slice(p + 46, p + 46 + nomeTam));
    const inicio = local + 30 + dv.getUint16(local + 26, true);
    const bruto = zip.slice(inicio, inicio + tamanho);
    const dados = metodo === 0 ? bruto : new Uint8Array(inflateRawSync(bruto));
    expect(crc32(dados)).toBe(crc);
    arquivos.set(nome, new TextDecoder().decode(dados));
    p += 46 + nomeTam;
  }
  return arquivos;
}

describe("crc32", () => {
  it("bate com o valor de referencia", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("letraDaColuna", () => {
  it("segue A..Z e depois AA, AB", () => {
    expect([0, 25, 26, 27, 32].map(letraDaColuna)).toEqual(["A", "Z", "AA", "AB", "AG"]);
  });
});

describe("escaparXml", () => {
  it("escapa os especiais e tira controle que o XML nao aceita", () => {
    expect(escaparXml('a<b>&"c\u0001')).toBe("a&lt;b&gt;&amp;&quot;c");
  });
});

describe("zipSemCompressao", () => {
  it("le de volta o que guardou", () => {
    const zip = zipSemCompressao([
      ["a.txt", new TextEncoder().encode("olá")],
      ["pasta/b.xml", new TextEncoder().encode("<x/>")],
    ]);
    const lido = lerZip(zip);
    expect(lido.get("a.txt")).toBe("olá");
    expect(lido.get("pasta/b.xml")).toBe("<x/>");
  });
});

describe("paraXlsx", () => {
  it("tem as partes que o Excel exige e a aba com o nome do antigo", () => {
    const arquivos = lerZip(paraXlsx(["ID", "Nome"], [[1, "Ana"]]));
    expect([...arquivos.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(arquivos.get("xl/workbook.xml")).toContain('<sheet name="Worksheet"');
  });

  it("cabecalho e linhas nas celulas certas; numero como numero, texto como texto", () => {
    const folha = lerZip(paraXlsx(["ID", "Site"], [[11318976, "Posto & Cia"], [2, null]])).get(
      "xl/worksheets/sheet1.xml",
    )!;
    expect(folha).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">ID</t></is></c>');
    expect(folha).toContain('<c r="A2"><v>11318976</v></c>');
    expect(folha).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">Posto &amp; Cia</t></is></c>');
    // Celula vazia nao e escrita.
    expect(folha).toContain('<row r="3"><c r="A3"><v>2</v></c></row>');
  });

  /** Texto que comeca com "=" fica texto: celula inlineStr nunca vira formula. */
  it("texto com cara de formula continua texto", () => {
    const folha = lerZip(paraXlsx(["X"], [["=1+1"]])).get("xl/worksheets/sheet1.xml")!;
    expect(folha).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(folha).not.toContain("<f>");
  });
});
