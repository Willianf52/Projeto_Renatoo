import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { CorpoDeRelatorioEsqueleto, FiltrosEmGradeEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { BarChartIcon } from "@/components/dashboard/icons";
import { Medidor } from "@/components/dashboard/Medidor";
import { formatarDiaCurto } from "@/lib/data-hora";
import {
  detalhamento,
  diasDoPeriodo,
  extrairFiltros,
  formatarData,
  formatarPercentual,
  getChecklists,
  MAXIMO_DE_DIAS,
  type SearchParams,
} from "../dados";
import { FiltrosDosRelatorios } from "../FiltrosDosRelatorios";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function DetalhamentoDoChecklistPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Relatórios" }, { label: "Detalhamento do Checklist" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Detalhamento do Checklist
          </h1>
        </div>
        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={7} colunas="xl:grid-cols-4" />}>
          <FiltrosDosRelatorios searchParams={searchParams} local="site" />
        </Suspense>
      </div>

      <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
        <Cartoes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-brand-surface px-4 py-10 text-center text-sm text-brand-muted animate-fade-in-up">
      {children}
    </p>
  );
}

async function Cartoes({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const dias = diasDoPeriodo(filtros);
  const periodo = `${formatarData(filtros.dataInicial)} até ${formatarData(filtros.dataFinal)}`;

  // Uma coluna por dia: periodo longo vira uma tabela que ninguem le, e
  // `dias` vazio e Data Inicial depois da Final.
  if (dias.length === 0) return <Aviso>A Data Inicial está depois da Data Final.</Aviso>;
  if (dias.length > MAXIMO_DE_DIAS) {
    return <Aviso>Escolha um período de até {MAXIMO_DE_DIAS} dias: o detalhamento tem uma coluna por dia.</Aviso>;
  }

  const cartoes = detalhamento(await getChecklists(filtros), dias);
  if (cartoes.length === 0) {
    return <Aviso>Nenhum checklist respondido de {periodo}. Ajuste o período ou os filtros acima.</Aviso>;
  }

  return (
    <div className="space-y-4">
      {cartoes.map((cartao) => (
        <section
          key={`${cartao.siteId}-${cartao.modeloId}`}
          className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
          aria-labelledby={`det-${cartao.siteId}-${cartao.modeloId}`}
        >
          <h2
            id={`det-${cartao.siteId}-${cartao.modeloId}`}
            className="bg-brand-blue px-4 py-3 text-sm font-semibold text-white"
          >
            {cartao.site}: {cartao.modelo}
          </h2>
          <div className="space-y-4 p-4">
            <Medidor valor={cartao.media} rotulo={cartao.modelo} />
            <div
              className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
              role="region"
              aria-label={`% de Conforme por dia: ${cartao.modelo} em ${cartao.site}`}
              tabIndex={0}
            >
              <table className="w-full text-sm" style={{ minWidth: `${320 + dias.length * 80}px` }}>
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-brand-muted">
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      {cartao.modelo}
                    </th>
                    {dias.map((dia) => (
                      <th key={dia} scope="col" className="w-20 px-2 py-2 text-center font-medium">
                        {formatarDiaCurto(dia)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cartao.perguntas.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/60">
                      <th scope="row" className="px-3 py-2 text-left font-normal text-slate-200">
                        {p.texto}
                      </th>
                      {p.porDia.map((valor, i) => (
                        <td key={dias[i]} className="px-2 py-2 text-center tabular-nums text-white">
                          {formatarPercentual(valor)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
