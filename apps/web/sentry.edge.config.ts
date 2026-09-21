// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { OPCOES_DE_PRIVACIDADE_DO_SENTRY } from "./src/lib/sentry-privacidade";

// Ver o comentário em sentry.server.config.ts -- mesma troca de DSN
// hardcoded por env, mesmo motivo.
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Nada de corpo, cookie ou dado de usuario -- ver src/lib/sentry-privacidade.ts.
  ...OPCOES_DE_PRIVACIDADE_DO_SENTRY,
});
