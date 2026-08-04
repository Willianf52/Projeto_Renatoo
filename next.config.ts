import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { HEADERS_ESTATICOS } from "./lib/security-headers";

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
  allowedDevOrigins: origensDaRedeLocal,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
