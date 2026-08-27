import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { HEADERS_ESTATICOS } from "./src/lib/security-headers";

/**
 * IPs desta maquina na rede local, liberados como origem do `next dev`.
 *
 * Sem isso o servidor de desenvolvimento responde 404 em todo /_next/* pedido
 * por uma origem diferente da que ele escuta: abrir o app pelo IP da rede
 * (http://192.168.x.x:3000, de um celular ou de outro notebook) entrega o HTML,
 * mas nenhum CSS nem JS -- a pagina chega crua e sem hidratar. Descobrir os
 * enderecos em tempo de execucao evita fixar um IP que o DHCP troca.
 *
 * So vale em desenvolvimento; o `next build` ignora esta chave.
 */
const origensDaRedeLocal = Object.values(networkInterfaces())
  .flat()
  .filter((rede) => rede?.family === "IPv4" && !rede.internal)
  .map((rede) => rede!.address);

/**
 * Unico ponto que emite cabecalho de seguranca -- CSP inclusive.
 *
 * O proxy nao emite nenhum, de proposito. Ele nao roda em /api nem em
 * arquivos estaticos (ver o matcher em proxy.ts), e essas respostas
 * tambem precisam de nosniff, frame-ancestors e CSP. Aqui o `source` casa com
 * tudo, entao nada fica descoberto e a politica mora num lugar so.
 *
 * Nada de nonce por requisicao: `headers()` e estatico e nao teria como
 * gera-lo. A tentativa foi feita e revertida por outros motivos tambem --
 * lib/security-headers.ts registra quais.
 */
const securityHeaders = Object.entries(HEADERS_ESTATICOS).map(([key, value]) => ({
  key,
  value,
}));

const nextConfig: NextConfig = {
  cacheComponents: true,
  allowedDevOrigins: origensDaRedeLocal,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Sem SENTRY_AUTH_TOKEN (SENTRY_AUTH_TOKEN em .env.local), o plugin não tenta
 * subir source map nenhum -- só registra os hooks de instrumentation.
 *
 * `tunnelRoute: "/monitoring"` manda o SDK do navegador enviar eventos pela
 * própria origem em vez de direto para `*.sentry.io` -- necessário aqui, não
 * cosmético: a CSP deste app (`lib/security-headers.ts`) restringe
 * `connect-src` a `'self'` + Supabase de propósito, então uma chamada direta
 * ao Sentry seria bloqueada pela própria política, mesmo caso do proxy do
 * ViaCEP em `api/cep`. `/monitoring` está excluído do matcher do middleware
 * de autenticação (`proxy.ts`) -- sem isso, um evento de erro na tela de
 * login (deslogado) seria redirecionado para "/" em vez de chegar ao Sentry.
 */
export default withSentryConfig(nextConfig, {
  org: "up-servicos",
  project: "javascript-nextjs",

  // Só verboso em CI -- silencioso em build local.
  silent: !process.env.CI,

  // Conjunto maior de source maps para stack trace legível (aumenta o tempo de build).
  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  webpack: {
    // Instrumentação automática de Vercel Cron Monitors -- inerte hoje (não há cron configurado).
    automaticVercelMonitors: true,

    // Remove os `Sentry.logger.*` do bundle final -- não usados neste projeto (lib/log.ts é o logger).
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
