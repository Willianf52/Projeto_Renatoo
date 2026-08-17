"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/Button";
import { XIcon } from "@/components/dashboard/icons";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro na area do dashboard:", error);
    // Sem SENTRY_DSN configurado isto e um no-op -- ver instrumentation-client.ts.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center animate-fade-in-up">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400">
        <XIcon className="h-5 w-5" />
      </span>
      <div className="max-w-sm">
        <p className="font-medium text-white">Não foi possível carregar esta página.</p>
        <p className="mt-1 text-sm text-brand-muted">
          Tente novamente. Se o problema continuar, procure o administrador.
        </p>
      </div>
      <Button type="button" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
