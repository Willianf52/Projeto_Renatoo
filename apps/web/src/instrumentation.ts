import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade de servidor/edge (hook padrao do Next 15+).
 *
 * Delega para `sentry.server.config.ts`/`sentry.edge.config.ts` (que fazem
 * o `Sentry.init` de verdade) em vez de inicializar aqui direto -- e o
 * padrao atual do SDK, e o motivo e concreto: o wizard (`npx @sentry/wizard`)
 * gera esses dois arquivos sempre que roda, sem tocar num `instrumentation.ts`
 * que já existe. Sem este import, os dois ficam orfaos -- nunca executados,
 * dsn nenhum sai do lugar -- e continuaria parecendo configurado (arquivos
 * presentes) sem estar.
 *
 * `Sentry.init` sem `dsn` fica inerte -- nao manda nada, sem custo de latencia
 * perceptivel. Sem `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` em .env.local (ou no
 * ambiente de producao), o app funciona normal, so sem observabilidade.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
