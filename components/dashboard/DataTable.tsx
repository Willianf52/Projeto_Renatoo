import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon } from "./icons";

export function DataTable({
  columns,
  rows = [],
  loading = false,
  page = 1,
  totalPages = 0,
  totalItems = 0,
  buildPageHref,
  emptyTitle = "Nenhuma coleta encontrada",
  emptyDescription = "Ajuste o período ou os filtros acima para localizar registros.",
  minWidth = "min-w-[1280px]",
}: {
  columns: string[];
  rows?: string[][];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  /** Sem isto, a paginacao renderiza desabilitada (uso sem dados reais). */
  buildPageHref?: (page: number) => string;
  /** Padrao voltado a tela de coletas, a primeira a usar a tabela. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Largura minima em classe Tailwind: depende de quantas colunas a tela
   * tem. Com poucas colunas, forcar 1280px cria rolagem horizontal inutil. */
  minWidth?: string;
}) {
  const podeVoltar = page > 1;
  const podeAvancar = totalPages > 0 && page < totalPages;

  return (
    <div className="overflow-x-auto rounded-b-lg">
      {/* 1280px: em 1100px as 12 colunas ficam na largura minima do conteudo e
          os titulos encostam um no outro. A folga extra e distribuida entre
          elas; abaixo disso a area rola na horizontal. */}
      <table className={`w-full ${minWidth} border-collapse text-left text-sm`}>
        <thead>
          <tr className="border-b border-slate-800 text-xs font-semibold uppercase tracking-wide text-brand-muted">
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
          ) : rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-800/60 hover:bg-white/5">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-white">
                    {cell || "—"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-end gap-1 border-t border-slate-800 px-4 py-3">
        <PaginationButton
          disabled={!podeVoltar}
          href={podeVoltar ? buildPageHref?.(1) : undefined}
          aria-label="Primeira página"
        >
          <ChevronsLeftIcon className="h-4 w-4" />
        </PaginationButton>
        <PaginationButton
          disabled={!podeVoltar}
          href={podeVoltar ? buildPageHref?.(page - 1) : undefined}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </PaginationButton>
        <span className="px-3 text-xs text-brand-muted">
          Pág: {totalItems > 0 ? page : 0} de {totalPages} | Total: {totalItems} itens
        </span>
        <PaginationButton
          disabled={!podeAvancar}
          href={podeAvancar ? buildPageHref?.(page + 1) : undefined}
          aria-label="Próxima página"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </PaginationButton>
        <PaginationButton
          disabled={!podeAvancar}
          href={podeAvancar ? buildPageHref?.(totalPages) : undefined}
          aria-label="Última página"
        >
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
          className="border-b border-slate-800/60 animate-fade-in"
          style={{ animationDelay: `${rowIndex * 60}ms` }}
        >
          {columns.map((column) => (
            <td key={column} className="px-4 py-3.5">
              <div className="h-3 animate-pulse rounded bg-white/10" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center animate-fade-in-up">
      <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
        <SearchIcon className="h-6 w-6" />
      </div>
      {/* slate-600 em vez de slate-400: garante contraste WCAG AA. */}
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="text-sm text-brand-muted">{description}</p>
    </div>
  );
}

function PaginationButton({
  children,
  disabled,
  href,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  href?: string;
  "aria-label": string;
}) {
  const className =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-brand-muted transition-all duration-200 hover:bg-brand-navy hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";

  if (!href || disabled) {
    return (
      <button type="button" disabled aria-label={ariaLabel} className={className}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
