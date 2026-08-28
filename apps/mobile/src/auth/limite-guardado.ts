import * as SecureStore from "expo-secure-store";

import { interpretarSalvo, serializar, type EstadoDoLimite } from "./limite-de-tentativas";

/**
 * Persistencia do limite de tentativas entre aberturas do app.
 *
 * O painel guarda isto em `sessionStorage`, e explica por que: sem persistir,
 * um F5 no meio do bloqueio zera o contador e a camada extra nao serve de
 * nada. No celular o contorno equivalente e fechar o app pelo seletor de
 * tarefas -- mais deliberado que um F5, mas igualmente ao alcance de qualquer
 * um, entao vale fechar do mesmo jeito.
 *
 * POR QUE NO SECURE STORE: nao porque isto seja segredo (nao e -- e um
 * contador e um horario), mas porque e o unico armazenamento persistente que
 * o app ja tem. Trazer um AsyncStorage so para guardar dois numeros custaria
 * mais dependencia do que o problema merece. A chave e propria e curta, entao
 * nao passa perto do limite de 2048 bytes do Android que obriga a sessao a
 * ser fragmentada (ver `lib/armazenamento-seguro.ts`).
 *
 * Nenhuma das duas funcoes propaga erro: se o Keystore estiver indisponivel,
 * o limite degrada para "so em memoria" -- que e pior do que o previsto, e
 * ainda assim muito melhor do que uma tela de login que nao abre.
 */
const CHAVE = "login-limite-de-tentativas";

/**
 * `AFTER_FIRST_UNLOCK`, igual a sessao: o app precisa conseguir ler isto na
 * abertura, antes de a tela ser desbloqueada.
 */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function lerLimiteGuardado(agora: number): Promise<EstadoDoLimite> {
  try {
    return interpretarSalvo(await SecureStore.getItemAsync(CHAVE, OPCOES), agora);
  } catch {
    return interpretarSalvo(null, agora);
  }
}

export async function guardarLimite(estado: EstadoDoLimite): Promise<void> {
  const valor = serializar(estado);

  try {
    // `null` e estado zerado: apaga em vez de gravar, para nao deixar para
    // tras um bloqueio vencido que a proxima leitura teria de descartar.
    if (valor === null) {
      await SecureStore.deleteItemAsync(CHAVE, OPCOES);
      return;
    }

    await SecureStore.setItemAsync(CHAVE, valor, OPCOES);
  } catch {
    // Ver a nota no topo: sem Keystore, o limite vale so nesta execucao.
  }
}
