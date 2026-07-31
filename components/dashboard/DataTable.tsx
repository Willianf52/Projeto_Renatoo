import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon } from "./icons";

export function DataTable({
  columns,
  loading = false,
}: {
  columns: string[];
  loading?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-b-lg">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {columns.map((column) => (
              <th key={column} scope="col" className="whitespace-nowrap px-4 py-3">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton columns={columns} />
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16">
                <EmptyState />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-end gap-1 border-t border-slate-200 px-4 py-3">
        <PaginationButton disabled aria-label="Primeira página">
          <ChevronsLeftIcon className="h-4 w-4" />
        </PaginationButton>
        <PaginationButton disabled aria-label="Página anterior">
          <ChevronLeftIcon className="h-4 w-4" />
        </PaginationButton>
        <span className="px-3 text-xs text-slate-500">Pág: 0 de 0 | Total: 0 itens</span>
        <PaginationButton disabled aria-label="Próxima página">
          <ChevronRightIcon className="h-4 w-4" />
        </PaginationButton>
        <PaginationButton disabled aria-label="Última página">
          <ChevronsRightIcon className="h-4 w-4" />
        </PaginationButton>
      </div>
    </div>
  );
}

/** Placeholder pulsante exibido enquanto os dados carregam. */
function TableSkeleton({ columns }: { columns: string[] }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <tr
          key={rowIndex}
          className="border-b border-slate-100 animate-fade-in"
          style={{ animationDelay: `${rowIndex * 60}ms` }}
        >
          {columns.map((column) => (
            <td key={column} className="px-4 py-3.5">
              <div className="h-3 animate-pulse rounded bg-slate-200" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center animate-fade-in-up">
      <div className="rounded-full bg-slate-100 p-3 text-slate-500">
        <SearchIcon className="h-6 w-6" />
      </div>
      {/* slate-600 em vez de slate-400: garante contraste WCAG AA. */}
      <p className="text-sm font-medium text-slate-700">Nenhuma coleta encontrada</p>
      <p className="text-sm text-slate-600">
        Ajuste o período ou os filtros acima para localizar registros.
      </p>
    </div>
  );
}

function PaginationButton({
  children,
  disabled,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-700 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
    >
      {children}
    </button>
  );
}
