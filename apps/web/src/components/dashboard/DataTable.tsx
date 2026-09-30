import Link from "next/link";
import { colunasNumericas } from "@/lib/colunas-numericas";
import { textoDaPaginacao } from "@/lib/paginacao";
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon } from "./icons";

/** Coluna de botoes das telas de cadastro: no cartao, vai para o pe. */
const COLUNA_DE_ACOES = "Ações";

/**
 * Celula fixa na borda (cabecalho no topo, primeira coluna na esquerda) com
 * fundo solido: sem ele, o conteudo que rola passaria visivel por baixo. A
 * divisoria vem de sombra interna, e nao de `border`, porque com
 * `border-collapse` a borda fica na tabela e nao acompanha a celula fixa.
 */
const FUNDO_FIXO = "bg-brand-surface";
const DIVISORIA_EMBAIXO = "shadow-[inset_0_-1px_0_var(--color-slate-800)]";
const DIVISORIA_A_DIREITA = "shadow-[inset_-1px_0_0_var(--color-slate-800)]";
/** Canto do cabecalho: uma sombra so, deslocada nos dois eixos -- duas
 * classes `shadow-*` na mesma celula disputariam a mesma propriedade. */
const DIVISORIA_DO_CANTO = "shadow-[inset_-1px_-1px_0_var(--color-slate-800)]";

/**
 * O realce de linha (`hover:bg-white/5`) e translucido; na celula fixa, que
 * precisa ser opaca, ele entra como camada de imagem por cima do mesmo fundo
 * -- a mesma cor final das outras celulas, sem hex novo.
 */
const REALCE_DA_CELULA_FIXA =
  "group-hover:bg-[linear-gradient(rgb(255_255_255/0.05),rgb(255_255_255/0.05))]";

export function DataTable({
  columns,
  rows = [],
  loading = false,
  page = 1,
  totalPages = 0,
  totalItems = 0,
  totalAproximado = false,
  buildPageHref,
  emptyTitle = "Nenhuma coleta encontrada",
  emptyDescription = "Ajuste o período ou os filtros acima para localizar registros.",
  minWidth = "min-w-[1280px]",
  rotulo = "Resultados",
  rodape,
}: {
  columns: string[];
  /** ReactNode e nao string: a coluna "Acoes" das telas de cadastro leva
   * botao, nao texto. Celula vazia continua virando travessao. */
  rows?: React.ReactNode[][];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  /** Marca o total com "~". Telas que contam por estimativa (count=estimated)
   * recebem um numero que pode ser aproximado, e apresenta-lo como contagem
   * exata seria afirmar mais do que se sabe. */
  totalAproximado?: boolean;
  /** Sem isto, a paginacao renderiza desabilitada (uso sem dados reais). */
  buildPageHref?: (page: number) => string;
  /** Padrao voltado a tela de coletas, a primeira a usar a tabela. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Largura minima em classe Tailwind: depende de quantas colunas a tela
   * tem. Com poucas colunas, forcar 1280px cria rolagem horizontal inutil. */
  minWidth?: string;
  /** Nome acessivel da area rolavel (ver o `tabIndex` abaixo). */
  rotulo?: string;
  /**
   * Linha fixa no pe da tabela, uma celula por coluna -- a linha "TOTAL:" de
   * Registro de Eventos. Em `<tfoot>` e nao como mais uma linha de `rows`
   * porque ela nao e um registro: nao pagina junto (o total e do filtro
   * inteiro), nao tem hover e o leitor de tela precisa saber que e resumo.
   * Some junto com a tabela quando nao ha resultado.
   */
  rodape?: React.ReactNode[];
}) {
  const podeVoltar = page > 1;
  const podeAvancar = totalPages > 0 && page < totalPages;
  const vazio = !loading && rows.length === 0;
  const numericas = colunasNumericas(rows);
  const alinhamento = (coluna: number) => (numericas.has(coluna) ? "text-right" : "");

  return (
    <div>
      {vazio ? (
        <div className="px-4 py-16">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <>
          {/* Tabela a partir de `lg`; abaixo disso, cartoes (mais embaixo).
              Com 12 colunas numa tela de tablet em pe, a tabela so existia
              rolando de lado, e a linha que se estava lendo sumia da vista.

              Focavel por teclado: a area rola nas duas direcoes, e sem
              `tabIndex` quem nao usa mouse nao alcanca o que esta fora da
              vista (axe `scrollable-region-focusable`). `role="region"` com
              nome para o leitor de tela anunciar o que recebeu o foco.

              Altura maxima para o cabecalho poder ficar fixo: com
              `overflow-x: auto` a area vira o contexto de rolagem do `sticky`
              nas duas direcoes, e sem rolar na vertical dentro dela o
              cabecalho nunca teria de onde "grudar" -- ia embora junto com a
              pagina, e numa lista de 25 linhas a pessoa terminava lendo
              numero sem saber de que coluna. `10rem` e a barra do topo mais a
              paginacao, que fica fora da area. */}
          <div
            role="region"
            aria-label={rotulo}
            tabIndex={0}
            className={`${loading ? "" : "hidden lg:block"} max-h-[calc(100dvh-10rem)] overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-green`}
          >
            {/* 1280px: em 1100px as 12 colunas ficam na largura minima do
                conteudo e os titulos encostam um no outro. A folga extra e
                distribuida entre elas; abaixo disso a area rola na horizontal.

                `tabular-nums`: algarismos de largura igual (recurso da propria
                Inter, nao outra fonte), para numero, data e hora formarem
                coluna -- sem ele, "11:11" e "08:08" tem larguras diferentes. */}
            <table className={`w-full ${minWidth} border-collapse text-left text-sm tabular-nums`}>
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  {columns.map((column, indice) => (
                    <th
                      key={column}
                      scope="col"
                      className={`sticky top-0 whitespace-nowrap px-4 py-3 ${FUNDO_FIXO} ${
                        indice === 0 ? `left-0 z-20 ${DIVISORIA_DO_CANTO}` : `z-10 ${DIVISORIA_EMBAIXO}`
                      } ${alinhamento(indice)}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* Uma entrada suave para o corpo inteiro, e nao uma cascata por
                  linha: a cascata (30ms x 12 linhas, mais 500ms de animacao)
                  se repetia a cada troca de pagina, e quem audita um
                  relatorio pagina muito -- era quase um segundo esperando a
                  ultima linha assentar para comecar a ler. */}
              <tbody className="animate-fade-in">
                {loading ? (
                  <TableSkeleton columns={columns} />
                ) : (
                  rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="group border-b border-slate-800/60 hover:bg-white/5">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={`whitespace-nowrap px-4 py-3 text-white ${
                            cellIndex === 0
                              ? `sticky left-0 z-[5] ${FUNDO_FIXO} ${DIVISORIA_A_DIREITA} ${REALCE_DA_CELULA_FIXA}`
                              : ""
                          } ${alinhamento(cellIndex)}`}
                        >
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {rodape && !loading && (
                <tfoot>
                  <tr className="border-t border-slate-800 bg-brand-navy/40 font-semibold text-white">
                    {rodape.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`whitespace-nowrap px-4 py-3 ${
                          cellIndex === 0 ? `sticky left-0 ${FUNDO_FIXO} ${DIVISORIA_A_DIREITA}` : ""
                        } ${alinhamento(cellIndex)}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {loading ? null : (
            <Cartoes columns={columns} rows={rows} rodape={rodape} rotulo={rotulo} numericas={numericas} />
          )}
        </>
      )}

      {/* Fora da area rolavel: antes ela rolava de lado junto com a tabela, e
          no tablet os botoes de pagina saiam da tela. */}
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
        <span className="px-3 text-xs text-brand-muted tabular-nums">
          {textoDaPaginacao({
            pagina: page,
            totalPaginas: totalPages,
            totalItens: totalItems,
            aproximado: totalAproximado,
          })}
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

/**
 * A mesma linha, empilhada: a primeira coluna vira titulo do cartao, as
 * outras viram pares rotulo/valor (o rotulo com o desenho do `<th>`), e a
 * coluna "Acoes" vai para o pe, onde o polegar alcanca. E a traducao que o
 * `LinhaDoCartao` do app de campo ja faz para o celular.
 */
function Cartoes({
  columns,
  rows,
  rodape,
  rotulo,
  numericas,
}: {
  columns: string[];
  rows: React.ReactNode[][];
  rodape?: React.ReactNode[];
  rotulo: string;
  numericas: Set<number>;
}) {
  const indiceDeAcoes = columns.indexOf(COLUNA_DE_ACOES);

  return (
    <ul aria-label={rotulo} className="animate-fade-in lg:hidden">
      {rows.map((row, rowIndex) => (
        <li key={rowIndex} className="border-b border-slate-800/60 px-4 py-4">
          <p className="text-sm font-semibold text-white">{row[0] || "—"}</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
            {columns.map((column, indice) =>
              indice === 0 || indice === indiceDeAcoes ? null : (
                <ParDoCartao key={column} rotulo={column} numerico={numericas.has(indice)}>
                  {row[indice] || "—"}
                </ParDoCartao>
              ),
            )}
          </dl>
          {indiceDeAcoes >= 0 && row[indiceDeAcoes] ? (
            <div className="mt-4 flex flex-wrap gap-2">{row[indiceDeAcoes]}</div>
          ) : null}
        </li>
      ))}

      {rodape ? (
        <li className="bg-brand-navy/40 px-4 py-4">
          <p className="text-sm font-semibold text-white">{rodape[0] || "Total"}</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
            {columns.map((column, indice) =>
              indice === 0 || !rodape[indice] ? null : (
                <ParDoCartao key={column} rotulo={column} numerico>
                  {rodape[indice]}
                </ParDoCartao>
              ),
            )}
          </dl>
        </li>
      ) : null}
    </ul>
  );
}

function ParDoCartao({
  rotulo,
  numerico,
  children,
}: {
  rotulo: string;
  numerico: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{rotulo}</dt>
      <dd className={`mt-0.5 break-words text-sm text-white ${numerico ? "tabular-nums" : ""}`}>{children}</dd>
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

/**
 * 36px (h-9) e a escala do `Button` (0.97): antes era 32px e `scale-90`, o
 * mesmo desvio de escala que o `Button.tsx` documenta ter eliminado.
 */
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
    "flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-brand-muted transition-all duration-200 hover:bg-brand-navy hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100";

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
