/**
 * Pergunta condicional e ordem aleatoria do checklist (migration 0108).
 *
 * Fonte unica, como o resto de `campo/`: o app decide o que mostrar e em que
 * ordem com estas funcoes, e nada aqui fala com o banco.
 *
 *   - Condicional: a pergunta so aparece quando a pergunta base recebe a
 *     resposta-gatilho. Um nivel so (o banco garante: a base nao e
 *     condicional), entao basta olhar a resposta da base.
 *   - Ordem aleatoria: embaralha DENTRO de cada grupo de perguntas, e a
 *     condicional anda grudada na sua base, logo depois dela. A semente e a
 *     inspecao: a mesma inspecao sempre ve a mesma ordem (rascunho, voltar ao
 *     checklist, trocar de tela), e outra inspecao ve outra.
 */

export type PerguntaCondicionavel = {
  id: number;
  grupo?: string | null;
  /** Pergunta base (0108); ausente ou nula: pergunta comum. */
  perguntaBaseId?: number | null;
  /** SIM, NAO ou NA da base que faz esta aparecer. */
  respostaGatilho?: string | null;
};

/** Visivel se for comum, ou se a base recebeu exatamente a resposta-gatilho. */
export function perguntaVisivel(
  pergunta: PerguntaCondicionavel,
  respostas: Readonly<Record<number, string | undefined>>,
): boolean {
  if (pergunta.perguntaBaseId == null) return true;
  return respostas[pergunta.perguntaBaseId] === pergunta.respostaGatilho;
}

export function perguntasVisiveis<T extends PerguntaCondicionavel>(
  perguntas: readonly T[],
  respostas: Readonly<Record<number, string | undefined>>,
): T[] {
  return perguntas.filter((pergunta) => perguntaVisivel(pergunta, respostas));
}

/** FNV-1a de 32 bits: transforma a semente (texto ou numero) num inteiro. */
function hash(semente: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: gerador pequeno e deterministico, suficiente para embaralhar. */
function gerador(semente: number): () => number {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A ordem de tela. Sem `aleatoria`, a lista volta como veio (ja na `ordem` do
 * cadastro). Com ela, cada pergunta comum forma um bloco com as condicionais
 * dela, os blocos se embaralham dentro do grupo, e os grupos ficam na ordem em
 * que aparecem.
 */
export function ordenarPerguntas<T extends PerguntaCondicionavel>(
  perguntas: readonly T[],
  aleatoria: boolean,
  semente: string | number,
): T[] {
  if (!aleatoria) return [...perguntas];

  const ids = new Set(perguntas.map((p) => p.id));
  const filhas = new Map<number, T[]>();
  for (const p of perguntas) {
    // Base fora da lista (inativa): a condicional vira bloco proprio; ela
    // nunca aparece mesmo, porque a base nunca e respondida.
    if (p.perguntaBaseId != null && ids.has(p.perguntaBaseId)) {
      const lista = filhas.get(p.perguntaBaseId) ?? [];
      lista.push(p);
      filhas.set(p.perguntaBaseId, lista);
    }
  }

  const grupos = new Map<string, T[][]>();
  for (const p of perguntas) {
    if (p.perguntaBaseId != null && ids.has(p.perguntaBaseId)) continue;
    const chave = p.grupo ?? "";
    const blocos = grupos.get(chave) ?? [];
    blocos.push([p, ...(filhas.get(p.id) ?? [])]);
    grupos.set(chave, blocos);
  }

  const aleatorio = gerador(hash(String(semente)));
  const saida: T[] = [];
  for (const blocos of grupos.values()) {
    // Fisher-Yates com o gerador da semente.
    for (let i = blocos.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [blocos[i], blocos[j]] = [blocos[j], blocos[i]];
    }
    for (const bloco of blocos) saida.push(...bloco);
  }
  return saida;
}
