import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import {
  AcoesEsqueleto,
  CorpoDeRelatorioEsqueleto,
  FiltrosEmGradeEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { ClipboardListIcon, ExcelIcon, PdfIcon } from "@/components/dashboard/icons";
import {
  analiticoPorChecklist,
  extrairFiltros,
  formatarData,
  formatarPercentual,
  getChecklists,
  primeiro,
  type SearchParams,
} from "../dados";
import { FiltrosDosRelatorios } from "../FiltrosDosRelatorios";

const ROTA = "/dashboard/checklistlab/relatorios/analitico-por-checklist";
type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function AnaliticoPorChecklistPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Relatórios" }, { label: "Analítico por Checklist" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Analítico por Checklist
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <Exportar searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={7} colunas="xl:grid-cols-4" />}>
          <FiltrosDosRelatorios searchParams={searchParams} local="grupo_site" />
        </Suspense>
      </div>

      <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
        <Cartoes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Exportar({ searchParams }: { searchParams: SearchParamsPromise }) {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const sufixo = query.toString() ? `?${query.toString()}` : "";
  return (
    <div className="flex items-center gap-2">
      <Acao titulo="Exportar para Excel" href={`${ROTA}/export/excel${sufixo}`} className="bg-emerald-600/40" target="_blank">
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao titulo="Exportar para PDF" href={`${ROTA}/export/pdf${sufixo}`} className="bg-red-600/40" target="_blank">
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

async function Cartoes({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const cartoes = analiticoPorChecklist(await getChecklists(filtros));
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
      {cartoes.map((cartao) => (
        <section
          key={cartao.modeloId}
          className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
          aria-labelledby={`checklist-${cartao.modeloId}`}
        >
          <h2 id={`checklist-${cartao.modeloId}`} className="bg-brand-blue px-4 py-3 text-sm font-semibold text-white">
            Checklist: {cartao.modelo}
          </h2>
          <div className="space-y-3 p-4">
            <p className="text-sm font-semibold text-white">Nº de checklists respondidos: {cartao.respondidos}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">% de Conforme por pergunta de {cartao.modelo}</caption>
                {cartao.grupos.map((grupo) => (
                  <tbody key={grupo.nome}>
                    <tr className="bg-white/5">
                      <th colSpan={2} scope="colgroup" className="px-3 py-2 text-left font-semibold text-slate-200">
                        {grupo.nome}
                      </th>
                    </tr>
                    {grupo.perguntas.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800/60">
                        <td className="px-3 py-2 text-slate-200">{p.texto}</td>
                        <td className="w-28 px-3 py-2 text-right tabular-nums text-white">
                          {formatarPercentual(p.percentual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <p className="text-xs text-brand-muted">
              % de Conforme entre Conforme e Não conforme, de {periodo}. Não se aplica e perguntas Sim/Não não entram (célula
              em branco), como na nota do checklist.
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
