import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@projeto-renatoo/shared";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      /**
       * O segundo parametro que o `@supabase/ssr` passa aqui -- os cabecalhos
       * de `no-store` que acompanham a gravacao de cookie de sessao -- fica de
       * fora de proposito, e nao por descuido: `cookies()` da acesso ao cookie
       * store, nao a resposta, e nao ha onde escrever cabecalho a partir daqui.
       * Quem aplica esses cabecalhos e `lib/supabase/middleware.ts`, que tem o
       * `NextResponse` na mao e e por onde a renovacao de token realmente
       * passa. Escrever cookie tambem ja marca a resposta como dinamica no
       * Next, o que a tira do cache de rota.
       */
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Chamado a partir de um Server Component: o middleware ja cuida
          // de renovar a sessao, entao pode ser ignorado com seguranca.
        }
      },
    },
  });
}
