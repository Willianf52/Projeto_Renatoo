import { randomInt } from "node:crypto";

/**
 * Apoio dos testes de requisicao das rotas de `/api`.
 *
 * O LIMITE DE TAXA E POR IP, e o IP vem do `x-real-ip` (`identificarChamador`
 * em lib/rate-limit.ts). Os specs rodam em paralelo contra o mesmo servidor e
 * o contador e compartilhado no Postgres (0048): sem um IP proprio por teste,
 * um teste que gasta a cota derrubaria o vizinho com 429 intermitente. Cada
 * teste pede um IPv6 da faixa de documentacao 2001:db8::/32 (RFC 3849), que
 * nunca e endereco real e tem espaco para nao colidir entre execucoes.
 */
export function ipDeTeste(): Record<string, string> {
  const grupo = () => randomInt(0, 0x10000).toString(16);
  return { "x-real-ip": `2001:db8::${grupo()}:${grupo()}:${grupo()}` };
}

/** Segredos que o job `e2e` define com valores descartaveis (ci.yml). Fora
 * dele, os testes que dependem deles se pulam. */
export const SEGREDOS = {
  importacao: process.env.IMPORTACAO_SECRET,
  webhook: process.env.SUPABASE_WEBHOOK_SECRET,
  cron: process.env.CRON_SECRET,
};
