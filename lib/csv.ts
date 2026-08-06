/**
 * Gera CSV a partir de colunas e linhas, para os botoes de "Exportar para
 * Excel". Excel abre CSV nativamente -- evita puxar uma biblioteca de .xlsx
 * binario so para isto, e mantem a exportacao livre de dependencia nova.
 *
 * Ponto e virgula como separador, nao virgula: no Excel em pt-BR a virgula ja
 * e o separador decimal, e o assistente de importacao com separador errado e
 * o tipo de atrito que faz a pessoa desistir de abrir o arquivo.
 *
 * Todo campo entre aspas (RFC 4180): mais simples que decidir caso a caso
 * quando aspar, e uma aspa dupla dentro do campo dobra, como a RFC manda.
 */
export function paraCsv(colunas: string[], linhas: string[][]): string {
  const linha = (campos: string[]) =>
    campos.map((campo) => `"${campo.replace(/"/g, '""')}"`).join(";");

  // BOM UTF-8 (U+FEFF), via fromCharCode para nao deixar um caractere
  // invisivel literal no arquivo-fonte: sem ele, o Excel no Windows abre o
  // arquivo como Latin-1 na falta de um jeito de detectar o encoding, e todo
  // acento quebra.
  const BOM = String.fromCharCode(0xfeff);
  return BOM + [linha(colunas), ...linhas.map(linha)].join("\r\n") + "\r\n";
}
