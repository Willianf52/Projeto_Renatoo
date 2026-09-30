import type { ReactNode } from "react";

/**
 * Numero de tabela: inteiro ou decimal com separador brasileiro (`1.234,5`),
 * com `~` de estimativa (ver `totalAproximado` na DataTable), sinal e `%`
 * opcionais. Data (`29/09/2026`) e hora (`10:30`) ficam de fora de proposito:
 * alinhadas a esquerda, como o resto do texto, elas se leem como rotulo da
 * linha; o que precisa de alinhamento a direita e quantidade, para as casas
 * decimais cairem uma embaixo da outra e a comparacao ser de relance.
 */
const NUMERO = /^~?-?\d{1,3}(?:\.\d{3})*(?:,\d+)?%?$|^~?-?\d+(?:,\d+)?%?$/;

/**
 * Indices das colunas em que toda celula preenchida e numero.
 *
 * Deduzido do conteudo, e nao declarado por tela: sao doze listagens, e uma
 * prop nova em cada uma seria doze lugares para esquecer quando uma coluna
 * mudar. Celula vazia (a DataTable desenha travessao) nao decide nada; coluna
 * inteira vazia nao e numerica -- nao ha o que alinhar. Celula que nao e texto
 * nem numero (um botao, um selo) tira a coluna da conta.
 */
export function colunasNumericas(linhas: readonly (readonly ReactNode[])[]): Set<number> {
  const numericas = new Set<number>();
  if (linhas.length === 0) return numericas;

  const totalDeColunas = Math.max(...linhas.map((linha) => linha.length));

  for (let coluna = 0; coluna < totalDeColunas; coluna++) {
    let preenchidas = 0;
    let todasNumericas = true;

    for (const linha of linhas) {
      const celula = linha[coluna];
      if (celula === null || celula === undefined || celula === "" || celula === false) continue;

      preenchidas++;
      if (!ehNumero(celula)) {
        todasNumericas = false;
        break;
      }
    }

    if (preenchidas > 0 && todasNumericas) numericas.add(coluna);
  }

  return numericas;
}

function ehNumero(celula: ReactNode): boolean {
  if (typeof celula === "number") return Number.isFinite(celula);
  if (typeof celula === "string") return NUMERO.test(celula.trim());
  return false;
}
