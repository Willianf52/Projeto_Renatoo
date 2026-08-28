import type { AppStateStatus } from "react-native";

/**
 * A DECISAO do ciclo de vida da sessao, separada do efeito que a executa.
 *
 * Mesma divisao de `lib/importacao-alerta.ts` no painel, e pelo mesmo motivo:
 * a regra ("devo revalidar agora?") e onde moram os casos de borda, mas
 * exercita-la dentro do hook exigiria montar React Native no vitest -- que o
 * `vitest.config.mts` deste pacote descarta de proposito. Como funcao pura, o
 * throttle e a deduplicacao ficam cobertos por teste com `environment: node`,
 * e o hook vira casca fina em volta disto.
 *
 * `import type` de `AppStateStatus`: e apagado na compilacao, entao este
 * modulo continua sem dependencia nativa nenhuma em tempo de execucao.
 */

/**
 * Janela minima entre duas revalidacoes de perfil disparadas pelo primeiro
 * plano.
 *
 * No iOS, abrir a central de controle ou atender uma ligacao produz
 * `active -> inactive -> active` em segundos. Sem esta janela, cada gesto
 * desses custaria um SELECT em `profiles` -- em rede de campo, que e onde este
 * app vive. Trinta segundos e curto o bastante para uma desativacao
 * administrativa aparecer na proxima vez que o inspetor pegar o aparelho, e
 * longo o bastante para o gesto acidental nao pagar nada.
 */
export const INTERVALO_MINIMO_ENTRE_REVALIDACOES_MS = 30_000;

export type AcaoDeCicloDeVida = {
  /**
   * `true` liga o ticker de refresh, `false` desliga, `null` nao mexe.
   *
   * O terceiro estado existe por causa do `inactive` do iOS: e transitorio
   * (central de controle, notificacao, seletor de apps) e costuma durar menos
   * que um ciclo de refresh -- parar e religar nele seria trabalho sem efeito.
   */
  autoRefresh: boolean | null;
  /** Relet `profiles` para pegar `ativo`/`cargo` que mudaram enquanto o app
   * estava fora do primeiro plano. */
  revalidarPerfil: boolean;
};

export type EntradaDeDecisao = {
  /** Estado imediatamente anterior do app. */
  anterior: AppStateStatus;
  /** Estado para o qual o app acabou de ir. */
  proximo: AppStateStatus;
  /** Ha uma revalidacao ainda sem resposta. */
  revalidacaoEmVoo: boolean;
  /**
   * Instante da ultima revalidacao BEM-SUCEDIDA, ou `null` se nunca houve.
   *
   * `null` explicito, e nao `0`: com zero como sentinela a condicao da janela
   * so passa porque `Date.now()` e da ordem de 1e12 -- funciona por acidente
   * de magnitude, e quebra em qualquer teste ou relogio simulado que comece
   * perto da epoca. O caso "primeira volta do app" merece um valor proprio.
   */
  ultimaRevalidacaoEm: number | null;
  agora: number;
};

export function decidirAcao(entrada: EntradaDeDecisao): AcaoDeCicloDeVida {
  const { anterior, proximo, revalidacaoEmVoo, ultimaRevalidacaoEm, agora } = entrada;

  if (proximo === "active") {
    return {
      autoRefresh: true,
      /**
       * Tres condicoes, todas necessarias:
       *
       * 1. `anterior !== "active"` -- so vale a pena revalidar quando o app
       *    de fato esteve fora; um evento `active -> active` (que o Android
       *    chega a emitir) nao traz informacao nova.
       * 2. `!revalidacaoEmVoo` -- deduplicacao. Duas transicoes rapidas nao
       *    podem virar duas consultas simultaneas a `profiles`.
       * 3. a janela de throttle -- ver a constante acima.
       */
      revalidarPerfil:
        anterior !== "active" &&
        !revalidacaoEmVoo &&
        (ultimaRevalidacaoEm === null ||
          agora - ultimaRevalidacaoEm >= INTERVALO_MINIMO_ENTRE_REVALIDACOES_MS),
    };
  }

  if (proximo === "background") {
    // O timer do supabase-js e suspenso pelo sistema aqui de qualquer jeito;
    // desligar explicitamente evita que ele acorde com um tick atrasado.
    return { autoRefresh: false, revalidarPerfil: false };
  }

  // `inactive` e `unknown`: nao mexe em nada.
  return { autoRefresh: null, revalidarPerfil: false };
}
