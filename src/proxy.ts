import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Chamava-se `middleware.ts` ate o Next 16, que renomeou a convencao para
 * `proxy` -- o nome antigo segue funcionando, mas depreciado.
 *
 * A troca nao e so de nome: `proxy` roda no runtime `nodejs`, e isso nao e
 * configuravel (o `middleware` rodava no `edge`). Aqui nao muda nada, porque
 * `updateSession` so mexe em cookie e fala com o Supabase por HTTP -- nada que
 * dependesse do runtime anterior.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto arquivos estaticos, imagens, /api e
     * /monitoring. Rotas de API (ex.: /api/webhooks/*) sao chamadas
     * server-to-server, sem cookie de sessao de navegador -- cair na
     * checagem de usuario aqui as redirecionaria pra "/" antes de rodar a
     * propria autenticacao da rota (ex.: segredo compartilhado no header).
     * Cada rota de API cuida da sua autenticacao.
     *
     * /monitoring e o `tunnelRoute` do Sentry (next.config.ts): o SDK do
     * navegador manda os eventos de erro pra la, mesma origem, pra nao
     * cair bloqueado pela CSP nem por adblocker. E so ida (sem sessao
     * necessaria) e roda ate na tela de login, deslogado -- cair na
     * checagem de usuario aqui perderia o evento redirecionando a
     * requisicao pra "/" em vez de deixar o proprio SDK do Sentry
     * encaminha-la.
     */
    "/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
