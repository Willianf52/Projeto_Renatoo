/**
 * Regra dos atalhos da Pagina Principal (pedido do dono, 02/10/2026), a mesma
 * do sistema de referencia:
 *
 * - a grade tem 12 posicoes;
 * - atalho FIXADO fica na posicao em que foi fixado;
 * - as posicoes livres recebem as outras telas, das mais usadas no MES
 *   ANTERIOR para as menos usadas -- por isso a ordem "muda todo mes", e nao
 *   a cada clique, o que deixaria os cartoes trocando de lugar sob o dedo;
 * - empate (inclusive "ninguem usou nada ainda") segue a ordem do menu.
 *
 * Pura e sem React: recebe as rotas, nao os componentes.
 */

export const TAMANHO_DA_GRADE = 12;

export type AtalhoFixado = { rota: string; posicao: number };
export type UsoDaTela = { rota: string; vezes: number };

/** A tela do menu a que uma rota aberta pertence (`/x/12/editar` conta para `/x`). */
export function telaDaRota(rota: string, hrefs: readonly string[]): string | null {
  let melhor: string | null = null;
  for (const href of hrefs) {
    if ((rota === href || rota.startsWith(`${href}/`)) && (!melhor || href.length > melhor.length)) {
      melhor = href;
    }
  }
  return melhor;
}

/** Soma o uso por tela do menu; rota fora do menu e descartada. */
export function usoPorTela(uso: readonly UsoDaTela[], hrefs: readonly string[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const { rota, vezes } of uso) {
    const tela = telaDaRota(rota, hrefs);
    if (tela) total.set(tela, (total.get(tela) ?? 0) + vezes);
  }
  return total;
}

/**
 * As rotas da grade, na ordem em que aparecem. `hrefs` e o menu, na ordem do
 * menu. Fixado que nao existe mais no menu (tela removida) e ignorado, e a
 * posicao dele volta a ser livre.
 */
export function montarGrade(
  hrefs: readonly string[],
  fixados: readonly AtalhoFixado[],
  uso: readonly UsoDaTela[],
): string[] {
  const tamanho = Math.min(TAMANHO_DA_GRADE, hrefs.length);
  const grade: (string | null)[] = Array.from({ length: tamanho }, () => null);
  const noMenu = new Set(hrefs);

  for (const { rota, posicao } of fixados) {
    if (noMenu.has(rota) && posicao >= 0 && posicao < tamanho && grade[posicao] === null) {
      grade[posicao] = rota;
    }
  }

  const jaNaGrade = new Set(grade.filter((rota): rota is string => rota !== null));
  const contagem = usoPorTela(uso, hrefs);
  const candidatos = hrefs
    .filter((href) => !jaNaGrade.has(href))
    .map((href, ordem) => ({ href, ordem, vezes: contagem.get(href) ?? 0 }))
    .sort((a, b) => b.vezes - a.vezes || a.ordem - b.ordem);

  let proximo = 0;
  return grade.map((rota) => rota ?? candidatos[proximo++].href);
}

/**
 * O mes anterior ao de `agora`, no horario de Brasilia (UTC-3, sem horario de
 * verao desde 2019): `[inicio, fim)`. "Mes anterior" no fuso do servidor
 * (UTC) cortaria as 21h do ultimo dia.
 */
export function mesAnterior(agora: Date): { inicio: Date; fim: Date } {
  const emBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const ano = emBrasilia.getUTCFullYear();
  const mes = emBrasilia.getUTCMonth();
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1, 3)),
    fim: new Date(Date.UTC(ano, mes, 1, 3)),
  };
}

/**
 * Fixar/desfixar no "Personalizar". Fixar prende a tela na posicao em que ela
 * esta na grade agora; tela fora da grade vai para a primeira posicao ainda
 * nao fixada (tirando de la quem nao estava fixado). Com as 12 posicoes
 * fixadas, nao ha onde por: devolve a lista como estava.
 */
export function alternarFixado(
  fixados: readonly AtalhoFixado[],
  grade: readonly string[],
  rota: string,
): AtalhoFixado[] {
  if (fixados.some((a) => a.rota === rota)) return fixados.filter((a) => a.rota !== rota);

  const ocupadas = new Set(fixados.map((a) => a.posicao));
  const naGrade = grade.indexOf(rota);
  const posicao =
    naGrade >= 0 && !ocupadas.has(naGrade)
      ? naGrade
      : Array.from({ length: grade.length }, (_, i) => i).find((i) => !ocupadas.has(i));

  return posicao === undefined ? [...fixados] : [...fixados, { rota, posicao }];
}
