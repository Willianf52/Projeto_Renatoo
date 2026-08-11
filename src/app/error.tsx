"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { BrandLogo } from "@/components/HeroPanel";

/**
 * Par do `app/dashboard/error.tsx`, agora no nivel de `app/`. As telas
 * publicas (`/`, `/recuperar-senha`, `/nova-senha`) sao client components que
 * falam com o Supabase e, sem este arquivo, uma quebra nelas caia na tela de
 * erro generica do Next em vez de uma tela que segue a identidade visual do
 * resto do sistema.
 *
 * Nao cobre erro no proprio `app/layout.tsx`: para isso o Next exige um
 * `global-error.tsx` com `<html>`/`<body>` proprios, e nada aqui lanca erro
 * durante a renderizacao do layout raiz hoje.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro na aplicação:", error);
    // Sem SENTRY_DSN configurado isto e um no-op -- ver instrumentation-client.ts.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-navy px-4 text-center">
      <BrandLogo size="sm" />
      <div className="max-w-sm rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <p className="font-medium">Não foi possível carregar esta página.</p>
        <p className="mt-1 text-xs text-red-300/80">
          Tente novamente. Se o problema continuar, procure o administrador.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-green-hover"
      >
        Tentar novamente
      </button>
    </div>
  );
}
