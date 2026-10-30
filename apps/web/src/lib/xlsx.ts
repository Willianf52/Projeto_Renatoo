/**
 * Gera uma planilha .xlsx de verdade (uma aba so), para as exportacoes que
 * precisam sair no mesmo formato do sistema antigo -- que entrega .xlsx, e nao
 * CSV como `lib/csv.ts`.
 *
 * Sem biblioteca: um .xlsx e um ZIP com meia duzia de XML. Aqui o ZIP sai sem
 * compressao (metodo "stored"), o que basta para planilhas deste tamanho e
 * evita depender de algoritmo de compressao. Escrito a mao para nao trazer
 * dependencia nova so para isto, pelo mesmo motivo que o CSV foi escrito a mao.
 *
 * Texto vai como celula de texto (`inlineStr`): o Excel nunca a avalia como
 * formula, entao a neutralizacao que o CSV precisa (`neutralizarFormula`) nao
 * se aplica aqui. Numero vai como numero.
 */

export type CelulaXlsx = string | number | null | undefined;

/** Monta o arquivo. `nomeDaAba` e o do antigo ("Worksheet") por padrao. */
export function paraXlsx(colunas: string[], linhas: CelulaXlsx[][], nomeDaAba = "Worksheet"): Uint8Array {
  const arquivos: [string, string][] = [
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", RELS],
    ["xl/workbook.xml", workbook(nomeDaAba)],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", planilha([colunas, ...linhas])],
  ];
  return zipSemCompressao(arquivos.map(([nome, xml]) => [nome, new TextEncoder().encode(xml)]));
}

/** "A", "B", ... "Z", "AA", "AB"... -- a letra da coluna (indice a partir de 0). */
export function letraDaColuna(indice: number): string {
  let resto = indice + 1;
  let letras = "";
  while (resto > 0) {
    const r = (resto - 1) % 26;
    letras = String.fromCharCode(65 + r) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}

/**
 * Escapa para XML e tira os caracteres de controle que o XML nao aceita: um
 * deles numa observacao digitada no app faria o Excel recusar o arquivo
 * inteiro como corrompido.
 */
export function escaparXml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function celula(valor: CelulaXlsx, referencia: string): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) return `<c r="${referencia}"><v>${valor}</v></c>`;
  return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(valor))}</t></is></c>`;
}

function planilha(linhas: CelulaXlsx[][]): string {
  const corpo = linhas
    .map((linha, i) => {
      const numero = i + 1;
      const celulas = linha.map((valor, j) => celula(valor, `${letraDaColuna(j)}${numero}`)).join("");
      return `<row r="${numero}">${celulas}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corpo}</sheetData></worksheet>`;
}

function workbook(nomeDaAba: string): string {
  // O Excel limita o nome da aba a 31 caracteres e recusa alguns simbolos.
  const nome = escaparXml(nomeDaAba.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nome}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** O minimo que o Excel exige para abrir sem reclamar: uma fonte, um preenchimento, uma borda, um estilo. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;

// ---------------------------------------------------------------------------
// ZIP sem compressao
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

/** CRC-32 do ZIP (o mesmo do gzip). */
export function crc32(dados: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of dados) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Monta um ZIP com os arquivos dados, todos guardados sem compressao. */
export function zipSemCompressao(arquivos: [string, Uint8Array][]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const [nome, dados] of arquivos) {
    const nomeEmBytes = new TextEncoder().encode(nome);
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // assinatura do cabecalho local
    local.setUint16(4, 20, true); // versao necessaria
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // metodo: guardado
    local.setUint16(10, 0, true); // hora
    local.setUint16(12, 0x21, true); // data: 01/01/1980
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeEmBytes.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nomeEmBytes, dados);

    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true); // assinatura do diretorio central
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(10, 0, true);
    entrada.setUint16(12, 0, true);
    entrada.setUint16(14, 0x21, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, dados.length, true);
    entrada.setUint32(24, dados.length, true);
    entrada.setUint16(28, nomeEmBytes.length, true);
    entrada.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(entrada.buffer), nomeEmBytes);

    deslocamento += 30 + nomeEmBytes.length + dados.length;
  }

  const tamanhoDoCentral = central.reduce((soma, parte) => soma + parte.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); // fim do diretorio central
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoDoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((soma, parte) => soma + parte.length, 0));
  let posicao = 0;
  for (const parte of todas) {
    saida.set(parte, posicao);
    posicao += parte.length;
  }
  return saida;
}
