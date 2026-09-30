import { larguraMaxima } from "@projeto-renatoo/shared";

/**
 * Quantas colunas uma lista usa nesta largura de janela: uma no celular, duas
 * a partir do tablet (`larguraMaxima.tablet`, o `md` do Tailwind).
 */
export function colunasParaLargura(larguraDaJanela: number): 1 | 2 {
  return larguraDaJanela >= larguraMaxima.tablet ? 2 : 1;
}

/**
 * Largura de cada item de uma lista em grade, ou `undefined` numa coluna so
 * (o item estica sozinho).
 *
 * Numero, e nao `flex: 1`: com `flex: 1`, o ultimo item de uma lista impar
 * ficava sozinho na linha e esticava pela largura das duas colunas -- um
 * cartao gordo no fim da lista, que parecia outro tipo de coisa. Largura fixa
 * mantem todos iguais, e o impar fica a esquerda, como na grade do painel.
 *
 * A conta parte da coluna de leitura (a janela, ate `larguraMaxima.leitura`),
 * menos o respiro dos dois lados e o vao entre as colunas.
 */
export function larguraDoItemNaGrade(
  larguraDaJanela: number,
  { respiro, vao }: { respiro: number; vao: number },
): number | undefined {
  if (colunasParaLargura(larguraDaJanela) === 1) return undefined;

  const coluna = Math.min(larguraDaJanela, larguraMaxima.leitura);
  return Math.floor((coluna - respiro * 2 - vao) / 2);
}
