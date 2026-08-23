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

/**
 * Caracteres que fazem o Excel tratar a celula como formula em vez de texto.
 *
 * As aspas da RFC 4180 NAO protegem disto: o Excel tira as aspas na
 * importacao e so entao decide o que a celula e. Um campo `"=1+1"` no arquivo
 * vira a formula `=1+1` na planilha.
 *
 * O `-` esta na lista por causa de `-2+3`, que o Excel avalia. Numero negativo
 * legitimo tambem comeca com `-` e vai ganhar o apostrofo -- e o preco, e e
 * barato: nenhuma coluna exportada aqui e numerica para calculo, sao codigos,
 * nomes e datas.
 */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Apostrofo a frente: e a convencao do proprio Excel para "isto e texto,
 * literalmente". Ele nao aparece na celula ao abrir a planilha, so na barra de
 * formulas.
 *
 * Sem isto, quem consegue escrever um cadastro consegue plantar formula na
 * planilha de quem exporta -- e as duas pontas nao sao a mesma pessoa:
 * `pode_administrar_cadastros()` (migration 0009) inclui OPERACIONAL, enquanto
 * exportar a operacao inteira exige GESTOR ou SUPERVISOR. `=HYPERLINK(...)`
 * montado com as celulas vizinhas exfiltra a linha ao primeiro clique.
 */
function neutralizarFormula(campo: string): string {
  return INICIO_DE_FORMULA.test(campo) ? `'${campo}` : campo;
}

export function paraCsv(colunas: string[], linhas: string[][]): string {
  const linha = (campos: string[]) =>
    campos.map((campo) => `"${neutralizarFormula(campo).replace(/"/g, '""')}"`).join(";");

  // BOM UTF-8 (U+FEFF), via fromCharCode para nao deixar um caractere
  // invisivel literal no arquivo-fonte: sem ele, o Excel no Windows abre o
  // arquivo como Latin-1 na falta de um jeito de detectar o encoding, e todo
  // acento quebra.
  const BOM = String.fromCharCode(0xfeff);
  return BOM + [linha(colunas), ...linhas.map(linha)].join("\r\n") + "\r\n";
}
