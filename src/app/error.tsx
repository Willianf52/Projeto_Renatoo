"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/Button";
import { BrandLogo } from "@/components/HeroPanel";
import { XIcon } from "@/components/dashboard/icons";

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
      <div className="animate-fade-in-up">
        <BrandLogo size="sm" />
      </div>

      <div
        className="flex max-w-sm flex-col items-center gap-3 animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400">
          <XIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-medium text-white">Não foi possível carregar esta página.</p>
          <p className="mt-1 text-sm text-brand-muted">
            Tente novamente. Se o problema continuar, procure o administrador.
          </p>
        </div>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: "160ms" }}>
        <Button type="button" onClick={reset}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
