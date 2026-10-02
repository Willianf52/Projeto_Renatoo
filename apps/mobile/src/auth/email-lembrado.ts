import * as SecureStore from "expo-secure-store";

/**
 * "Lembrar meu e-mail" da tela de login (pedido do dono, 02/10/2026).
 *
 * SO O E-MAIL, NUNCA A SENHA. A senha fica com o chaveiro do aparelho (iCloud
 * Keychain / Gerenciador de senhas do Google), que o campo oferece pelo
 * `autoComplete` -- e que pede Face ID ou digital antes de preencher. Guardar
 * a senha aqui deixaria qualquer pessoa com o aparelho destravado entrar
 * direto; e a sessao ja dura 30 dias, entao a senha so volta a ser pedida
 * depois de "Sair" ou do prazo.
 *
 * No Secure Store pelo mesmo motivo de `limite-guardado.ts`: e o unico
 * armazenamento persistente do app. Nenhuma funcao propaga erro -- sem
 * Keystore, o campo so volta vazio, como antes.
 */
const CHAVE = "login-email-lembrado";

const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function lerEmailLembrado(): Promise<string | null> {
  try {
    const valor = await SecureStore.getItemAsync(CHAVE, OPCOES);
    return valor && valor.trim() ? valor : null;
  } catch {
    return null;
  }
}

/** `null` esquece: e o que a caixa desmarcada pede no proximo login. */
export async function guardarEmailLembrado(email: string | null): Promise<void> {
  try {
    const valor = email?.trim().toLowerCase();
    if (!valor) {
      await SecureStore.deleteItemAsync(CHAVE, OPCOES);
      return;
    }
    await SecureStore.setItemAsync(CHAVE, valor, OPCOES);
  } catch {
    // Ver a nota no topo.
  }
}
