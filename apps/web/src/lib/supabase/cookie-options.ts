/**
 * Atributos aplicados aos cookies de sessao do Supabase.
 *
 * O `@supabase/ssr` (0.12.4) tem defaults proprios em
 * `utils/constants.js` -- `path: "/"`, `sameSite: "lax"`, `httpOnly: false`,
 * `maxAge` de 400 dias -- e **nao define `secure`**. Sem ele o navegador
 * aceita mandar o cookie de sessao por HTTP puro, e um downgrade de conexao
 * (Wi-Fi hostil, proxy no meio) entrega o token de acesso em texto claro. O
 * HSTS de `lib/security-headers.ts` cobre boa parte disso, mas so depois da
 * primeira visita ao dominio -- `secure` nao depende de visita anterior.
 *
 * SO EM PRODUCAO, pelo mesmo motivo que `upgrade-insecure-requests` fica de
 * fora em dev (ver `lib/security-headers.ts`): o `next dev` acessado pelo IP
 * da rede local roda em `http://192.168.x.x:3000`, e um cookie `Secure` seria
 * descartado pelo navegador ali. O sintoma seria login que "nao acontece" --
 * a sessao e criada e o cookie sumiria em silencio.
 *
 * `sameSite` fica em `lax`, NAO em `strict`, de proposito: `/auth/callback`
 * e alcancado por clique em link de e-mail (recuperacao de senha), que e
 * navegacao cross-site. Com `strict` o cookie nao acompanharia essa
 * navegacao e o fluxo de recuperar senha quebraria. `lax` ja barra o que
 * importa aqui -- envio em requisicao cross-site que nao seja navegacao
 * top-level.
 *
 * `httpOnly` continua `false` e nao ha como mudar: `createBrowserClient` le a
 * sessao por `document.cookie` para falar com o GoTrue direto do navegador --
 * e a arquitetura do proprio pacote. Quem contem o risco disso e a CSP
 * (`script-src 'self'`), que limita de onde script pode vir.
 */
const EM_PRODUCAO = process.env.NODE_ENV === "production";

export const COOKIE_OPTIONS = {
  secure: EM_PRODUCAO,
} as const;
