/**
 * Cabecalhos de seguranca aplicados a toda resposta.
 *
 * Sobre o script-src ainda ter 'unsafe-inline': a alternativa correta seria
 * nonce por requisicao, e ela foi tentada e revertida. Paginas como "/" sao
 * prerenderizadas estaticamente -- o HTML sai pronto no build, sem espaco para
 * um nonce que muda a cada acesso. E a especificacao manda o navegador ignorar
 * 'unsafe-inline' assim que existe um nonce na diretiva, entao os scripts
 * inline do proprio Next eram bloqueados e a tela de login ficava sem o
 * formulario. Usar nonce aqui exigiria tornar todas as paginas dinamicas,
 * trocando cache por uma protecao que este app quase nao exercita: nao ha
 * dangerouslySetInnerHTML nem renderizacao de HTML vindo do usuario.
 *
 * O que a CSP abaixo ainda garante, agora aplicada e nao mais em Report-Only:
 * script externo so do proprio dominio, sem plugins, sem embutir a aplicacao
 * em iframe de terceiro e trafego XHR restrito ao Supabase.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // A API do Supabase e chamada direto do navegador com a anon key.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const HEADERS_ESTATICOS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // 2 anos, subdominios incluidos. A Vercel envia HSTS nos dominios dela, mas
  // dominio proprio nao pode depender disso.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": CSP,
};
