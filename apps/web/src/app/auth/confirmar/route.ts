import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Link de e-mail no formato `token_hash` (recuperacao de senha, convite).
 *
 * POR QUE ALEM DO `/auth/callback` (02/10/2026): o callback so troca `code`
 * do fluxo PKCE, e o `code` so vale no MESMO navegador que pediu o e-mail --
 * o verificador fica num cookie dele. Pedido feito pelo app de campo (que
 * nao tem esse cookie) ou e-mail aberto no celular depois de pedir no
 * computador chegavam sem `code` valido e caiam em "link expirou". O
 * `token_hash` e verificado aqui mesmo, no servidor, e vale em qualquer
 * aparelho. Os modelos de e-mail do Supabase apontam para esta rota.
 */
const TIPOS: readonly EmailOtpType[] = ["recovery", "invite", "signup", "email", "email_change", "magiclink"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  // Recuperacao sem `next` vai direto escolher a senha nova.
  const next = safeRedirectPath(searchParams.get("next"), tipo === "recovery" ? "/nova-senha" : "/dashboard");

  if (tokenHash && tipo && TIPOS.includes(tipo)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?erro=link-invalido`);
}
