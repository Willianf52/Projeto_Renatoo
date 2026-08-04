import type { NextConfig } from "next";
import { HEADERS_ESTATICOS } from "./lib/security-headers";

/**
 * A CSP nao esta aqui: ela precisa de um nonce novo a cada requisicao, e
 * headers() e estatico. Quem a emite e o middleware, via
 * lib/security-headers.ts.
 *
 * Os cabecalhos fixos ficam duplicados aqui de proposito: o middleware nao
 * roda em /api nem em arquivos estaticos, e essas respostas tambem precisam
 * de nosniff e frame-ancestors.
 */
const securityHeaders = Object.entries(HEADERS_ESTATICOS).map(([key, value]) => ({
  key,
  value,
}));

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
