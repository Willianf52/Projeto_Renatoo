/**
 * Bloco pulsante generico, mesma linguagem visual do `TableSkeleton` de
 * `DataTable.tsx` (bg-white/10 + animate-pulse). Existe separado para telas
 * de carregamento de rota inteira (`loading.tsx`), que precisam montar a
 * forma da pagina antes de qualquer linha de tabela existir.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/10 ${className}`} />;
}
