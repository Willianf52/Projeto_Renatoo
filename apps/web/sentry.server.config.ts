// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { OPCOES_DE_PRIVACIDADE_DO_SENTRY } from "./src/lib/sentry-privacidade";

// DSN via env (SENTRY_DSN, .env.local/.env.example), não hardcoded como o
// wizard gerou -- mesma convenção do resto do projeto (nunca um segundo
// lugar onde um valor de configuração mora e pode sair de sincronia), e
// necessário para dev/preview não mandarem evento pro mesmo projeto Sentry
// de produção sem ninguém decidir isso.
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Nada de corpo, cookie ou dado de usuario -- ver src/lib/sentry-privacidade.ts.
  ...OPCOES_DE_PRIVACIDADE_DO_SENTRY,
});
