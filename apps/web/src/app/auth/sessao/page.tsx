"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { lerSessaoDoLink } from "@/lib/sessao-do-link";
import { createClient } from "@/lib/supabase/client";

/**
 * Destino do link de recuperacao pedido pelo app de campo. Abre a sessao com
 * os tokens do fragmento e segue para `next` (a `/nova-senha`). O porque esta
 * em `lib/sessao-do-link.ts`.
 */
function AbrirSessao() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next"), "/nova-senha");

  useEffect(() => {
    const sessao = lerSessaoDoLink(window.location.hash);

    // Tira os tokens da barra de endereco e do historico antes de qualquer
    // coisa -- e antes de o cliente do Supabase nascer e tentar ler o
    // fragmento sozinho (ele e PKCE e recusaria).
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (!sessao.ok) {
      router.replace("/?erro=link-invalido");
      return;
    }

    void createClient()
      .auth.setSession({ access_token: sessao.accessToken, refresh_token: sessao.refreshToken })
      .then(({ error }) => router.replace(error ? "/?erro=link-invalido" : next));
  }, [next, router]);

  return null;
}

export default function SessaoDoLinkPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy text-sm text-brand-muted">
      <p role="status">Abrindo o link...</p>
      <Suspense>
        <AbrirSessao />
      </Suspense>
    </main>
  );
}
