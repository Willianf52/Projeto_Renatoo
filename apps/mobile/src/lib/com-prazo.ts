/**
 * Espera uma promessa por no maximo `ms`; passado o prazo, devolve `ESGOTADO`
 * e deixa a promessa seguir sozinha (quem chamou ainda pode aguarda-la).
 *
 * Existe por causa do retry do postgrest-js: leitura GET sem sinal e tentada
 * de novo tres vezes, com 1 s, 2 s e 4 s entre elas. Para o inspetor no
 * subsolo isso era ~20 s olhando um esqueleto antes de a copia do aparelho
 * entrar (teste no emulador, 12/10/2026).
 */
export const ESGOTADO = Symbol("prazo esgotado");

/** Quanto a leitura do servidor espera antes de a copia do aparelho valer. */
export const PRAZO_ANTES_DA_COPIA_MS = 5000;

export function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T | typeof ESGOTADO> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const esgotou = new Promise<typeof ESGOTADO>((resolver) => {
    relogio = setTimeout(() => resolver(ESGOTADO), ms);
  });
  return Promise.race([promessa, esgotou]).finally(() => clearTimeout(relogio));
}
