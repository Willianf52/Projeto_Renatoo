import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto arquivos estaticos, imagens e /api.
     * Rotas de API (ex.: /api/webhooks/*) sao chamadas server-to-server, sem
     * cookie de sessao de navegador -- cair na checagem de usuario aqui as
     * redirecionaria pra "/" antes de rodar a propria autenticacao da rota
     * (ex.: segredo compartilhado no header). Cada rota de API cuida da sua
     * autenticacao.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
