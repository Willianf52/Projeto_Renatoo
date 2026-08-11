import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade do navegador. Mesmo raciocinio de instrumentation.ts:
 * inerte sem NEXT_PUBLIC_SENTRY_DSN. Session Replay comeca desligado de
 * proposito -- e coleta de tela real de quem usa o sistema, decisao que
 * merece ser tomada com o DSN, nao herdada por default de biblioteca.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

/** Hook exigido pelo Next para instrumentar troca de rota (navegacao entre
 * paginas do App Router) nos traces de performance do Sentry. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
