import { env } from "./env";

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
/** Quatro diretivas abaixo mudam entre dev e producao; ver cada uma no lugar. */
const EM_PRODUCAO = process.env.NODE_ENV === "production";

/**
 * Origem exata do projeto Supabase, nao um curinga.
 *
 * `https://*.supabase.co` autoriza *qualquer* projeto Supabase, e criar um e
 * gratuito. Numa CSP a diretiva connect-src e o que sobra para conter
 * exfiltracao depois que um script hostil ja esta rodando: com o curinga, esse
 * script manda a sessao e as coletas para o projeto do atacante sem violar
 * politica nenhuma -- e o navegador nao reclama, porque o destino casava com a
 * regra. Fixando a origem, so o projeto real e alcancavel.
 *
 * Derivada de NEXT_PUBLIC_SUPABASE_URL para nao virar um segundo lugar onde a
 * URL do projeto mora e sai de sincronia. `.origin` normaliza: barra final ou
 * caminho colado na env nao vazam para a diretiva.
 */
const supabaseOrigem = new URL(env.supabaseUrl).origin;

/** "https://x" -> "wss://x" e "http://x" -> "ws://x" (Supabase local). */
const supabaseWebSocket = supabaseOrigem.replace(/^http/, "ws");

const CSP = [
  "default-src 'self'",
  /**
   * 'unsafe-eval' so em desenvolvimento: o webpack do `next dev` embrulha cada
   * modulo dentro de um eval(). Sem a diretiva o navegador bloqueia todos eles,
   * o runtime do Next para no meio e a pagina fica inerte -- renderiza o HTML
   * do servidor, mas nao hidrata, entao nenhum campo controlado reage ao que se
   * digita. O bundle de producao nao usa eval, e la a diretiva continua fechada.
   */
  EM_PRODUCAO
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // A API do Supabase e chamada direto do navegador com a anon key. Em dev
  // soma-se o websocket do Fast Refresh, que roda em ws:// sem TLS.
  EM_PRODUCAO
    ? `connect-src 'self' ${supabaseOrigem} ${supabaseWebSocket}`
    : `connect-src 'self' ws: ${supabaseOrigem} ${supabaseWebSocket}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  /**
   * `upgrade-insecure-requests` pressupoe HTTPS. Em dev acessado pelo IP da
   * rede local (http://192.168.x.x:3000) ele faz o navegador reescrever CSS, JS
   * e imagens para https, que o `next dev` nao atende: a pagina chega crua, sem
   * estilo nem hidratacao. Em localhost o sintoma nao aparece, porque o
   * navegador ja trata essa origem como segura e pula o upgrade -- o que torna
   * a falha facil de confundir com problema de layout.
   */
  ...(EM_PRODUCAO ? ["upgrade-insecure-requests"] : []),
].join("; ");

export const HEADERS_ESTATICOS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // 2 anos, subdominios incluidos. A Vercel envia HSTS nos dominios dela, mas
  // dominio proprio nao pode depender disso. Fica de fora em dev, onde nao ha
  // HTTPS para o navegador fixar.
  ...(EM_PRODUCAO
    ? {
        "Strict-Transport-Security":
          "max-age=63072000; includeSubDomains; preload",
      }
    : {}),
  "Content-Security-Policy": CSP,
};
