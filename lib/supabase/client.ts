import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Singleton de modulo. `createClient()` era chamado de novo a cada
 * `handleSubmit` (LoginForm, TrocarSenha, RecuperarSenha, NovaSenha,
 * DashboardNavbar), recriando o client -- e a instancia de GoTrue por tras
 * dele -- sem necessidade a cada submit. Memoizar um por sessao do navegador
 * e o padrao comum para o client do browser.
 */
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
