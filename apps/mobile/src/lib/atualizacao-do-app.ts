import * as Updates from "expo-updates";

/**
 * Atualizacao pelo ar puxada a mao (20/11/2026): ao puxar a tela inicial para
 * baixo, o app pergunta ao EAS se ha versao nova e ja a baixa.
 *
 * Sem isto, a atualizacao so chegava em duas aberturas: a primeira baixava
 * (`checkAutomatically: ON_LOAD`) e so a segunda rodava a versao nova, e o
 * dono precisava explicar "abre, fecha de verdade, abre de novo" a cada
 * mudanca.
 *
 * Fora do APK (Expo Go, desenvolvimento) as atualizacoes estao desligadas e
 * nada aqui roda. Falha de rede nao e erro para a tela: vira "sem novidade".
 */

export type ResultadoDaBusca = "nova-baixada" | "sem-novidade" | "indisponivel";

export async function buscarAtualizacao(): Promise<ResultadoDaBusca> {
  if (!Updates.isEnabled) return "indisponivel";
  try {
    const verificacao = await Updates.checkForUpdateAsync();
    if (!verificacao.isAvailable) return "sem-novidade";
    const baixada = await Updates.fetchUpdateAsync();
    return baixada.isNew ? "nova-baixada" : "sem-novidade";
  } catch {
    return "sem-novidade";
  }
}

/** Reinicia o app ja na versao baixada. */
export async function aplicarAtualizacao(): Promise<void> {
  await Updates.reloadAsync();
}
