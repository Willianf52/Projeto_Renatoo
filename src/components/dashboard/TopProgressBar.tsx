/**
 * Barra fina no topo do conteudo, visivel enquanto o Suspense do segmento
 * carrega (ver dashboard/loading.tsx). Indeterminada -- RSC nao expoe um
 * percentual real de progresso, so o fato de que algo esta em andamento.
 */
export function TopProgressBar() {
  return (
    <div
      role="progressbar"
      aria-label="Carregando"
      className="fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-brand-green/10"
    >
      <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-brand-green" />
    </div>
  );
}
