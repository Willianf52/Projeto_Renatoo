import * as Sentry from "@sentry/react-native";

import { registrarDestino, temDestinoConfigurado } from "./observabilidade";

/**
 * O adaptador do Sentry -- o unico arquivo do app que importa o SDK.
 *
 * Importado so pelo `index.ts`. O motivo de ele existir separado de
 * `observabilidade.ts` esta escrito la: o SDK arrasta o `react-native`, que e
 * Flow e nao carrega no vitest, e os modulos que mais precisam ser
 * instrumentados sao justamente os que tem teste node puro.
 */

/**
 * Liga o SDK e registra o destino dos eventos.
 *
 * Chamada uma vez, no `index.ts`, antes de qualquer componente montar -- erro
 * de import ou de primeiro render acontece antes de qualquer efeito, e um
 * init dentro de `App` chegaria tarde para justamente o crash mais dificil de
 * reproduzir.
 *
 * Devolve se ligou, para o chamador nao ter de reimplementar a checagem.
 */
export function iniciarObservabilidade(): boolean {
  if (!temDestinoConfigurado()) return false;

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    // Mesma taxa do painel (`tracesSampleRate: 0.1`): o volume esperado e de
    // 15 aparelhos, e 10% ja da curva suficiente para ver regressao de
    // latencia sem gastar cota com ronda que correu bem.
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // O que separa o evento do inspetor do evento do build de homologacao
    // quando os dois apontarem para o mesmo projeto algum dia. Preenchido por
    // perfil no `eas.json`.
    environment: process.env.EXPO_PUBLIC_AMBIENTE ?? "producao",
  });

  registrarDestino({
    erro: (excecao, etiquetas) => {
      Sentry.captureException(excecao, { tags: etiquetas });
    },
    aviso: (mensagem, etiquetas, detalhe) => {
      Sentry.captureMessage(mensagem, { level: "warning", tags: etiquetas, extra: detalhe });
    },
    usuario: (id) => {
      Sentry.setUser(id === null ? null : { id });
    },
  });

  return true;
}

/**
 * Envolve a raiz do app para capturar erro de render que o handler global nao
 * ve. Sem DSN devolve o proprio componente, sem envolver nada -- e o que
 * mantem o bundle de desenvolvimento identico ao de antes deste arquivo.
 */
export function envolverRaiz<T>(componente: T): T {
  if (!temDestinoConfigurado()) return componente;

  return Sentry.wrap(componente as never) as T;
}
