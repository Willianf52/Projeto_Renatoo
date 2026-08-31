import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@projeto-renatoo/shared";

/**
 * Singleton de modulo. `createClient()` era chamado de novo a cada
 * `handleSubmit` (LoginForm, TrocarSenha, RecuperarSenha, NovaSenha,
 * DashboardNavbar), recriando o client -- e a instancia de GoTrue por tras
 * dele -- sem necessidade a cada submit. Memoizar um por sessao do navegador
 * e o padrao comum para o client do browser.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!client) {
    // `cookieOptions` tambem aqui, e nao so no cliente de servidor: e este que
    // grava o cookie de sessao logo depois do `signInWithPassword`, direto do
    // navegador. Sem ele, o cookie mais importante do fluxo -- o recem-criado
    // no login -- nasceria sem `Secure`, e a correcao no servidor so valeria a
    // partir da primeira renovacao de token.
    client = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      cookieOptions: COOKIE_OPTIONS,
    });
  }
  return client;
}
