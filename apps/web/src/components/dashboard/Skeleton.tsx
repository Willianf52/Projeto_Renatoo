/**
 * Bloco pulsante generico, mesma linguagem visual do `TableSkeleton` de
 * `DataTable.tsx` (bg-white/10 + animate-pulse). Existe separado para telas
 * de carregamento de rota inteira (`loading.tsx`), que precisam montar a
 * forma da pagina antes de qualquer linha de tabela existir.
 *
 * `as="span"` existe para os fallbacks que caem dentro de texto -- o da
 * sidebar mora num <p>, e um <div> ali faria o navegador fechar o paragrafo
 * antes do skeleton, quebrando o layout so no cliente.
 */
export function Skeleton({
  className = "",
  as: Tag = "div",
}: {
  className?: string;
  as?: "div" | "span";
}) {
  return <Tag className={`animate-pulse rounded bg-white/10 ${className}`} />;
}
