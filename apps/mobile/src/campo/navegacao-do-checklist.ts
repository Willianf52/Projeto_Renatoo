/**
 * Navegacao entre as perguntas da consultoria, separada da tela para ser
 * testada sem React Native (mesma divisao de `pendencias-do-checklist.ts`).
 *
 * Duas pecas do app do sistema de referencia:
 *
 * - "Exibir apenas questoes em branco" (menu da tela do checklist): Anterior e
 *   Proximo pulam as perguntas ja respondidas. Desligado, andam uma a uma.
 * - "Grupo de perguntas": o seletor no topo leva a primeira pergunta do grupo
 *   escolhido. O grupo e o do cadastro (`grupos_perguntas`, 0073); perguntas
 *   sem grupo nao aparecem no seletor, e um checklist sem nenhum grupo nao
 *   mostra o seletor.
 *
 * `indice === total` e o resumo, como na tela.
 */

export type PerguntaNavegavel = { id: number; grupo?: string | null };

/** O indice da proxima pergunta (ou `total`, o resumo). */
export function proximoIndice(
  perguntas: readonly PerguntaNavegavel[],
  respostas: Readonly<Record<number, string | undefined>>,
  indice: number,
  soEmBranco: boolean,
): number {
  const total = perguntas.length;
  if (!soEmBranco) return Math.min(indice + 1, total);
  for (let i = indice + 1; i < total; i += 1) {
    if (!respostas[perguntas[i].id]) return i;
  }
  return total;
}

/**
 * O indice da pergunta anterior. Com "so em branco" e nenhuma em branco antes,
 * fica onde esta (`null`): voltar para uma respondida contraria o filtro.
 */
export function indiceAnterior(
  perguntas: readonly PerguntaNavegavel[],
  respostas: Readonly<Record<number, string | undefined>>,
  indice: number,
  soEmBranco: boolean,
): number | null {
  const inicio = Math.min(indice, perguntas.length) - 1;
  if (inicio < 0) return null;
  if (!soEmBranco) return inicio;
  for (let i = inicio; i >= 0; i -= 1) {
    if (!respostas[perguntas[i].id]) return i;
  }
  return null;
}

export type GrupoDePerguntas = {
  nome: string;
  primeiro: number;
  quantidade: number;
};

/** Os grupos na ordem em que aparecem, com a primeira pergunta de cada um. */
export function gruposDasPerguntas(perguntas: readonly PerguntaNavegavel[]): GrupoDePerguntas[] {
  const grupos = new Map<string, GrupoDePerguntas>();
  perguntas.forEach((pergunta, i) => {
    const nome = pergunta.grupo?.trim();
    if (!nome) return;
    const existente = grupos.get(nome);
    if (existente) existente.quantidade += 1;
    else grupos.set(nome, { nome, primeiro: i, quantidade: 1 });
  });
  return [...grupos.values()];
}
