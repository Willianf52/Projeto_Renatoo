/**
 * "Sessao em inatividade" do app do sistema de referencia: quem volta ao app
 * depois de um tempo parado confirma que ainda e a mesma pessoa ("Sim, sou
 * eu") ou sai ("Nao sou eu"). O aparelho de campo e dividido entre turnos, e a
 * sessao dura 30 dias (`prazo-da-sessao.ts`): sem esta pergunta, quem pega o
 * tablet no turno seguinte trabalha no nome do colega sem perceber.
 *
 * A regra fica aqui, pura, para teste sem React Native; o efeito mora em
 * `componentes/ConfirmacaoDeInatividade.tsx`.
 */

/** Tempo fora do app que pede a confirmacao: 30 minutos. */
export const LIMITE_DE_INATIVIDADE_MS = 30 * 60 * 1000;

/**
 * Pergunta so quando o app esteve FORA do primeiro plano por pelo menos o
 * limite. Tempo com o app aberto na mao nao conta: o inspetor preenchendo um
 * checklist longo nao deve ser interrompido.
 */
export function precisaConfirmar(saiuEm: number | null, voltouEm: number, limite = LIMITE_DE_INATIVIDADE_MS): boolean {
  if (saiuEm === null) return false;
  return voltouEm - saiuEm >= limite;
}
