import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from "./icons";

export function DataTable({ columns }: { columns: string[] }) {
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
          <tr>
            <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">
              Nenhum registro encontrado
            </td>
          </tr>
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
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
