import { Skeleton } from "@/components/dashboard/Skeleton";
import { TopProgressBar } from "@/components/dashboard/TopProgressBar";

/**
 * Suspense fallback do segmento `/dashboard` inteiro -- cobre toda troca de
 * rota da area logada, entao o formato precisa ser generico o bastante para
 * qualquer tela (a maioria segue o mesmo molde: breadcrumb, card com
 * cabeçalho, linha de filtros, tabela).
 *
 * Silhueta da pagina em vez de um spinner solto no centro: um spinner some e
 * da lugar a um layout inteiro diferente, o que le como "a tela trocou de
 * novo". A silhueta já ocupa o espaço final, então só o conteúdo troca.
 */
export default function DashboardLoading() {
  return (
    <>
      <TopProgressBar />
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-3" />
          <Skeleton className="h-4 w-28" />
        </div>

        <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-end">
            <Skeleton className="h-10 w-full sm:max-w-xs" />
            <Skeleton className="h-10 w-full sm:max-w-xs" />
            <Skeleton className="h-10 w-full shrink-0 sm:w-40" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <tbody>
                {Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="animate-fade-in border-b border-slate-800/60"
                    style={{ animationDelay: `${rowIndex * 60}ms` }}
                  >
                    {Array.from({ length: 5 }).map((_, columnIndex) => (
                      <td key={columnIndex} className="px-4 py-3.5">
                        <Skeleton className="h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
