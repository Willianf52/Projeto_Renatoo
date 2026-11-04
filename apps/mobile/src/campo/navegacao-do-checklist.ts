/**
 * "Grupo de perguntas" do app do sistema de referencia, separado da tela para
 * ser testado sem React Native: o seletor no topo do checklist leva a
 * primeira pergunta do grupo escolhido. O grupo e o do cadastro
 * (`grupos_perguntas`, 0073); perguntas sem grupo nao aparecem no seletor, e
 * um checklist sem nenhum grupo nao mostra o seletor.
 */

export type PerguntaNavegavel = { id: number; grupo?: string | null };

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
