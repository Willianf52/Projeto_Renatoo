import type { NextConfig } from "next";

// CSP em Report-Only: o Next injeta script/estilo inline para hidratacao (RSC
// payload, bootstrap), entao uma CSP bloqueante sem infraestrutura de nonce
// quebraria a hidratacao. Fica em modo relatorio ate alguem confirmar, no
// console do navegador, que nenhuma violacao aparece -- so entao vale trocar
// para o header sem o sufixo "-Report-Only".
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
