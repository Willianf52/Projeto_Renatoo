"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: encaminhar para um servico de observabilidade quando existir um.
    console.error("Erro na area do dashboard:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
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
