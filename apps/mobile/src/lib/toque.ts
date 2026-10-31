import * as Haptics from "expo-haptics";

/**
 * Vibracao curta de confirmacao ao toque (31/10/2026).
 *
 * Em campo o inspetor muitas vezes nao olha a tela no instante do toque -- esta
 * de luva, no sol, segurando a prancheta. A escala de 0.97 do `Botao` so
 * confirma para quem esta olhando; a vibracao confirma pela mao.
 *
 * Tres intensidades, cada uma com um papel, e nada alem delas: vibracao em todo
 * toque vira ruido e para de significar alguma coisa.
 *
 * Toda chamada engole o erro de proposito. Aparelho sem motor de vibracao, modo
 * de economia ou o sistema negando o pedido nao podem derrubar o toque que
 * pediu a vibracao -- ela e enfeite, a acao e o que importa.
 */

/** Botao de acao principal (Entrar, Proximo, Finalizar). */
export function toqueLeve(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Escolha numa lista de opcoes (Conforme, Nao conforme, Nao se aplica). */
export function toqueDeEscolha(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** A visita foi enviada: o fim do trabalho no local. */
export function toqueDeSucesso(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
