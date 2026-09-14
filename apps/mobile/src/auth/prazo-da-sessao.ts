import { DIAS_MAXIMOS_DE_SESSAO, sessaoVencida } from "@projeto-renatoo/shared";

/**
 * Quando o app de campo encerra a sessao pelo prazo de 30 dias
 * (`packages/shared/src/sessao.ts`).
 *
 * SO COM SINAL. A regra so vale depois de uma leitura de `profiles` que deu
 * certo -- prova de que ha rede para entrar de novo. O inspetor que abre o app
 * no 31o dia dentro de uma planta sem cobertura NAO e derrubado: derrubado
 * ali, ele nao consegue digitar a senha (login exige rede) e perde o turno
 * inteiro sem registrar nada. Assim que o aparelho pegar sinal e o perfil for
 * relido, a sessao cai e ele entra de novo na hora.
 *
 * As visitas que estiverem na fila offline nao se perdem: a fila e do aparelho,
 * recortada pelo inspetor (`campo/fila.ts`), e sobe quando ele entrar de novo.
 */
export function deveEncerrarPorPrazo(entrada: {
  ultimoLoginEm: string | null | undefined;
  perfilLidoComSucesso: boolean;
  agora?: Date;
}): boolean {
  return entrada.perfilLidoComSucesso && sessaoVencida(entrada.ultimoLoginEm, entrada.agora);
}

export const AVISO_DE_SESSAO_EXPIRADA = `Sua sessão expirou após ${DIAS_MAXIMOS_DE_SESSAO} dias. Entre novamente.`;
