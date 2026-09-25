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

/**
 * Le um CSV de volta em linhas de campos -- o caminho inverso de `paraCsv`,
 * para os botoes de "Importar".
 *
 * Aceita o que o nosso Exportar gera E o que o Excel regrava depois que a
 * pessoa edita o arquivo, que nao sao a mesma coisa:
 * - separador `;` (o nosso, e o do Excel em pt-BR) ou `,` (Excel em ingles,
 *   Google Planilhas) -- decidido pela primeira linha, que e o cabecalho;
 * - campos com ou sem aspas, aspa dobrada dentro de aspas, quebra de linha
 *   dentro de campo aspado;
 * - CRLF ou LF, BOM UTF-8 ou nao;
 * - o apostrofo que `neutralizarFormula` poe na frente de `=`, `+`, `-`, `@`:
 *   sem desfaze-lo, exportar e reimportar trocaria `-Norte` por `'-Norte`.
 *
 * Linhas vazias no MEIO sao mantidas, para o indice de cada linha continuar
 * batendo com o numero da linha na planilha -- e por ele que a tela de
 * importacao aponta onde esta o erro. So as do FIM caem, que sao as que o
 * Excel costuma deixar.
 */
export function lerCsv(texto: string): string[][] {
  const conteudo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] ?? "";
  const separador = primeiraLinha.includes(";") ? ";" : ",";

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  const fecharCampo = () => {
    linha.push(desfazerNeutralizacao(campo.trim()));
    campo = "";
  };
  const fecharLinha = () => {
    fecharCampo();
    linhas.push(linha);
    linha = [];
  };

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];

    if (entreAspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') entreAspas = true;
    else if (c === separador) fecharCampo();
    else if (c === "\n") fecharLinha();
    else if (c !== "\r") campo += c;
  }

  if (campo !== "" || linha.length > 0) fecharLinha();

  while (linhas.length > 0 && linhas[linhas.length - 1].every((c) => c === "")) linhas.pop();

  return linhas;
}

function desfazerNeutralizacao(campo: string): string {
  return campo.startsWith("'") && INICIO_DE_FORMULA.test(campo.slice(1)) ? campo.slice(1) : campo;
}
