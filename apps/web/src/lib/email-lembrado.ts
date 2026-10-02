/**
 * "Lembrar meu e-mail" do login (pedido do dono, 02/10/2026).
 *
 * SO O E-MAIL, NUNCA A SENHA. A senha fica com o gerenciador de senhas do
 * navegador, que o campo ja convida com `autocomplete="current-password"`.
 * Guardar a senha aqui a deixaria legivel para qualquer script da pagina e
 * para quem abrir o DevTools; e a sessao ja dura 30 dias
 * (`cookie-options.ts`), entao ela so volta a ser pedida depois de "Sair".
 *
 * localStorage, e nao sessionStorage como o bloqueio do LoginForm: o ponto e
 * justamente sobreviver ao navegador fechado. Nenhuma funcao propaga erro --
 * sem storage (modo privado, bloqueio do navegador), o campo so vem vazio.
 */
const CHAVE = "login-email-lembrado";

export function lerEmailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Vazio esquece: e o que a caixa desmarcada pede no proximo login. */
export function guardarEmailLembrado(email: string): void {
  try {
    const valor = email.trim().toLowerCase();
    if (valor) localStorage.setItem(CHAVE, valor);
    else localStorage.removeItem(CHAVE);
  } catch {
    // Ver a nota no topo.
  }
}

/**
 * Para o `useSyncExternalStore` do LoginForm: o e-mail so muda de fora por
 * outra aba, e o evento `storage` e exatamente isso.
 */
export function assinarEmailLembrado(aoMudar: () => void): () => void {
  window.addEventListener("storage", aoMudar);
  return () => window.removeEventListener("storage", aoMudar);
}
