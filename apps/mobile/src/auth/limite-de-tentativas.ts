/**
 * A REGRA do limite de tentativas de login, separada da tela que a executa --
 * mesma divisao (e mesmo motivo) de `ciclo-de-vida.ts`: a logica de contagem e
 * bloqueio fica coberta por teste com `environment: node`, e a tela vira casca
 * fina em volta.
 *
 * Espelha o que o `LoginForm.tsx` do painel faz: cinco credenciais erradas
 * seguidas bloqueiam o envio por trinta segundos.
 *
 * NAO E A DEFESA. Quem barra ataque de verdade e o limite do proprio Supabase
 * Auth, no servidor -- este aqui roda dentro de um APK, onde qualquer um pode
 * arrancar a checagem, reinstalar o app ou simplesmente falar com a API
 * direto. O que ele entrega e o mesmo que no painel: retorno visivel para
 * quem errou a senha e desestimulo a ficar martelando o botao na tela. E, por
 * ser a mesma regra e o mesmo texto dos dois lados, o inspetor que erra a
 * senha no celular ve exatamente o que veria no portal.
 */

/** Falhas seguidas ate o bloqueio. Igual ao `MAX_TENTATIVAS` do painel. */
export const MAX_TENTATIVAS = 5;

/** Duracao do bloqueio. Igual ao `BLOQUEIO_MS` do painel. */
export const BLOQUEIO_MS = 30_000;

export type EstadoDoLimite = {
  /** Falhas acumuladas desde o ultimo acerto ou bloqueio. */
  tentativas: number;
  /** Instante em que o bloqueio termina, ou `null` se nao ha bloqueio. */
  bloqueadoAte: number | null;
};

export const LIMITE_ZERADO: EstadoDoLimite = { tentativas: 0, bloqueadoAte: null };

/**
 * Uma credencial recusada.
 *
 * Ao atingir o teto, o contador ZERA e o bloqueio comeca -- e nao "fica em 5 e
 * bloqueia". A diferenca aparece depois que o bloqueio vence: com o contador
 * zerado, quem volta tem cinco tentativas novas; sem zerar, a primeira falha
 * seguinte cairia direto em outro bloqueio, e trinta segundos viraria
 * bloqueio permanente para quem simplesmente esqueceu a senha. O painel faz
 * igual.
 */
export function registrarFalha(atual: EstadoDoLimite, agora: number): EstadoDoLimite {
  const proxima = atual.tentativas + 1;

  if (proxima >= MAX_TENTATIVAS) {
    return { tentativas: 0, bloqueadoAte: agora + BLOQUEIO_MS };
  }

  return { tentativas: proxima, bloqueadoAte: null };
}

/**
 * Segundos que faltam do bloqueio -- zero quando esta liberado.
 *
 * Arredonda para cima para a contagem nunca mostrar "0s" com o botao ainda
 * travado: a tela usa este mesmo numero para decidir se bloqueia e para
 * escrever a mensagem, entao os dois nao tem como discordar.
 */
export function segundosRestantes(estado: EstadoDoLimite, agora: number): number {
  if (estado.bloqueadoAte === null) return 0;

  const restante = Math.ceil((estado.bloqueadoAte - agora) / 1000);

  return restante > 0 ? restante : 0;
}

/**
 * Le o estado guardado entre aberturas do app.
 *
 * Bloqueio ja vencido volta como zerado, e valor corrompido (ou de uma versao
 * futura com outro formato) tambem: preferir o estado zerado a rejeitar a
 * leitura e deliberado -- um JSON estragado no armazenamento nao pode ser o
 * motivo de um inspetor nao conseguir entrar em campo.
 */
export function interpretarSalvo(bruto: string | null, agora: number): EstadoDoLimite {
  if (bruto === null) return LIMITE_ZERADO;

  let salvo: unknown;

  try {
    salvo = JSON.parse(bruto);
  } catch {
    return LIMITE_ZERADO;
  }

  if (typeof salvo !== "object" || salvo === null) return LIMITE_ZERADO;

  const { tentativas, bloqueadoAte } = salvo as Partial<EstadoDoLimite>;

  if (typeof bloqueadoAte === "number" && bloqueadoAte > agora) {
    return { tentativas: 0, bloqueadoAte };
  }

  // Sem bloqueio valido, o que sobra e a contagem -- desde que seja um numero
  // inteiro dentro do teto. Um "tentativas: 4000" gravado a mao nao deve virar
  // bloqueio eterno na proxima falha.
  if (Number.isInteger(tentativas) && tentativas! > 0 && tentativas! < MAX_TENTATIVAS) {
    return { tentativas: tentativas!, bloqueadoAte: null };
  }

  return LIMITE_ZERADO;
}

/**
 * O que gravar, ou `null` quando nao ha nada a guardar (estado zerado) -- a
 * tela usa esse `null` para apagar a chave em vez de gravar lixo.
 */
export function serializar(estado: EstadoDoLimite): string | null {
  if (estado.bloqueadoAte !== null) {
    return JSON.stringify({ tentativas: 0, bloqueadoAte: estado.bloqueadoAte });
  }

  if (estado.tentativas > 0) {
    return JSON.stringify({ tentativas: estado.tentativas, bloqueadoAte: null });
  }

  return null;
}
