import { Skeleton } from "./Skeleton";

/**
 * Fallbacks das fronteiras de `<Suspense>` das telas de listagem.
 *
 * Existem porque o Cache Components (next.config.ts) obriga cada tela a
 * fatiar as partes dinamicas em fronteiras proprias -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx`, a primeira a ser convertida. Sao
 * doze telas com a mesma moldura (barra de acoes, linha de filtros, tabela),
 * e escrever os tres esqueletos em cada uma era o tipo de duplicacao que
 * diverge sem ninguem perceber: o sintoma nao e erro, e uma tela pulando no
 * carregamento enquanto as outras nao.
 *
 * A REGRA de todos: repetir a FORMA final da fronteira, nao um spinner.
 * Mesmo criterio ja escrito em `dashboard/loading.tsx` -- a silhueta ocupa o
 * espaco definitivo, entao so o conteudo troca quando o dado chega, sem o
 * salto de layout que um spinner central provoca.
 */

/** Botoes da barra de acoes do cabecalho (importar, Excel, PDF, novo...). */
export function AcoesEsqueleto({ quantidade = 3 }: { quantidade?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: quantidade }).map((_, indice) => (
        <Skeleton key={indice} className="h-8 w-8 shrink-0 rounded-md" />
      ))}
    </div>
  );
}

/**
 * Linha de filtros em coluna unica que vira linha no xl -- o formato das
 * telas de cadastro: os campos ocupam a largura livre e o botao Filtrar fica
 * fixo a direita.
 *
 * `gradeInterna` vai como classe INTEIRA, e nao montada com template string:
 * o Tailwind varre o codigo-fonte procurando nomes de classe literais, e um
 * `xl:grid-cols-${n}` nunca entraria no bundle -- o esqueleto sairia sem
 * grade nenhuma, so em telas grandes, que e o tipo de defeito que so aparece
 * em producao.
 */
export function FiltrosEmLinhaEsqueleto({
  campos = 1,
  gradeInterna = "",
}: {
  campos?: number;
  gradeInterna?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className={`min-w-0 flex-1 ${gradeInterna}`}>
        {Array.from({ length: campos }).map((_, indice) => (
          <div key={indice} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full shrink-0 xl:w-52" />
    </div>
  );
}

/**
 * Grade de filtros das telas de relatorio. `celulas` conta os campos MAIS o
 * botao Filtrar, que ocupa a ultima celula da grade (nao e irmao fora dela).
 */
export function FiltrosEmGradeEsqueleto({
  celulas,
  colunas = "xl:grid-cols-6",
}: {
  celulas: number;
  colunas?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4 ${colunas}`}
    >
      {Array.from({ length: celulas }).map((_, indice) => (
        <div key={indice} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Corpo das telas de relatorio, que terminam num grafico e nao numa tabela.
 *
 * Um bloco unico, e nao barras falsas: o grafico real so aparece quando ha
 * periodo selecionado, e desenhar barras no esqueleto prometeria um conteudo
 * que muitas vezes nao vem -- o lugar costuma ser ocupado pelo "Selecione um
 * periodo".
 */
export function CorpoDeRelatorioEsqueleto({ altura = "h-72" }: { altura?: string }) {
  return (
    <div className="space-y-4 p-4">
      <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-36" />
      </div>
      <Skeleton className={`w-full ${altura}`} />
    </div>
  );
}

/**
 * Corpo da tabela. `minWidth` acompanha o mesmo valor passado ao `DataTable`
 * da tela -- divergir faria a largura mudar no instante em que o dado chega,
 * que e exatamente o salto que o esqueleto existe para evitar.
 */
export function TabelaEsqueleto({
  colunas,
  linhas = 8,
  minWidth = "min-w-[1280px]",
}: {
  colunas: number;
  linhas?: number;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-collapse text-left text-sm`}>
        <tbody>
          {Array.from({ length: linhas }).map((_, linha) => (
            <tr
              key={linha}
              className="animate-fade-in border-b border-slate-800/60"
              style={{ animationDelay: `${linha * 60}ms` }}
            >
              {Array.from({ length: colunas }).map((_, coluna) => (
                <td key={coluna} className="px-4 py-3.5">
                  <Skeleton className="h-3 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
