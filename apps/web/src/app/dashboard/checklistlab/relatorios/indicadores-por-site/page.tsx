import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { CorpoDeRelatorioEsqueleto, FiltrosEmGradeEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { PieChartIcon } from "@/components/dashboard/icons";
import { Medidor } from "@/components/dashboard/Medidor";
import { extrairFiltros, formatarData, getChecklists, indicadoresPorSite, type SearchParams } from "../dados";
import { FiltrosDosRelatorios } from "../FiltrosDosRelatorios";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function IndicadoresPorSitePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Relatórios" }, { label: "Indicadores por Site" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PieChartIcon className="h-4 w-4" />
            Indicadores por Site
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

function legenda(respondidos: number): string {
  return `${respondidos} ${respondidos === 1 ? "checklist" : "checklists"}`;
}

async function Cartoes({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const cartoes = indicadoresPorSite(await getChecklists(filtros));
  const periodo = `${formatarData(filtros.dataInicial)} até ${formatarData(filtros.dataFinal)}`;

  if (cartoes.length === 0) {
    return (
      <p className="rounded-lg bg-brand-surface px-4 py-10 text-center text-sm text-brand-muted animate-fade-in-up">
        Nenhum checklist respondido de {periodo}. Ajuste o período ou os filtros acima.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-brand-muted">
        Média das notas dos checklists respondidos de {periodo}. Só aparecem os sites com checklist no período.
      </p>
      {cartoes.map((cartao) => (
        <section
          key={cartao.siteId}
          className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
          aria-labelledby={`site-${cartao.siteId}`}
        >
          <h2 id={`site-${cartao.siteId}`} className="bg-brand-blue px-4 py-3 text-sm font-semibold text-branco">
            Sites: {cartao.site}
          </h2>
          <div className="flex flex-col gap-6 p-4 md:flex-row md:items-start">
            <div className="flex shrink-0 justify-center md:border-r md:border-slate-800 md:pr-6">
              <Medidor valor={cartao.media} rotulo="MÉDIA GERAL" legenda={legenda(cartao.respondidos)} />
            </div>
            <div className="flex flex-wrap justify-center gap-4 md:justify-start">
              {cartao.modelos.map((m) => (
                <Medidor key={m.modeloId} valor={m.media} rotulo={m.modelo} legenda={legenda(m.respondidos)} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
