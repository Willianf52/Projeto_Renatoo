import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade de servidor/edge (hook padrao do Next 15+).
 *
 * `Sentry.init` sem `dsn` fica inerte -- nao manda nada, sem custo de
 * latencia perceptivel. E o estado de hoje: o fio existe, ninguem colou um
 * DSN ainda (SENTRY_DSN em .env.local). Ver docs/melhorias.md.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
