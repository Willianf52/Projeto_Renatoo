import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  CorpoDeRelatorioEsqueleto,
  FiltrosEmLinhaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterMonthPicker } from "@/components/dashboard/FilterMonthPicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { FilterIcon, PieChartIcon, SearchIcon } from "@/components/dashboard/icons";
import { PieChart } from "@/components/dashboard/PieChart";
import { extrairFiltros, getHistoricoDeSupervisao, getOpcoesSites, type SearchParams } from "./queries";

const TABLE_COLUMNS = ["Data/Hora", "Funcionário", "Local", "Geolocalização", "Motivo Visita", "Observação"];

/** "yyyy-mm" -> "mm/yyyy", como no sistema de referencia. */
function formatarPeriodo(mes: string): string {
  const [ano, mesNumero] = mes.split("-");
  return `${mesNumero}/${ano}`;
}

/** "mm/dd/aaaa - HH:mm hs", como no sistema de referencia -- diferente do
 * formatarDataHora() de lib/data-hora.ts (que usa virgula, sem "hs"), entao
 * fica local em vez de forcar as outras telas a mudar de formato junto. */
function formatarDataHoraVisita(valor: string | null): string {
  if (!valor) return "";
  const data = new Date(valor);
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()} - ${hora}:${minuto} hs`;
}

type SearchParamsPromise = Promise<SearchParams>;

/**
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components).
 *
 * Duas fronteiras: esta tela nao tem barra de acoes, e o titulo nao depende de
 * consulta -- fica inteiro no shell estatico.
 */
export default function VisitasDeSupervisaoPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Inspeções" },
            { label: "Relatórios" },
            { label: "Histórico de Visitas de Supervisão" },
          ]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PieChartIcon className="h-4 w-4" />
            Histórico de Visitas de Supervisão
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={2} gradeInterna="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto altura="h-64" />}>
          <CorpoDoHistorico searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** GET nativo, mesmo mecanismo das demais telas. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoesSites = await getOpcoesSites();

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-end"
    >
      <div className="w-full sm:w-40">
        <FilterMonthPicker label="Mês/Ano" name="mes" defaultValue={filtros.mes} />
      </div>
      <div className="min-w-0 flex-1">
        <FilterSelect
          label="Selecione um local"
          name="site"
          defaultValue={filtros.site}
          options={opcoesSites}
        />
      </div>
      <Button type="submit" className="group shrink-0 sm:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function CorpoDoHistorico({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const historico = filtros.site ? await getHistoricoDeSupervisao(filtros) : null;

  if (!historico) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
        <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
          <SearchIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-white">Selecione um local</p>
        <p className="text-sm text-brand-muted">
          Escolha o mês/ano e o local acima e clique em Filtrar para ver o histórico de visitas.
        </p>
      </div>
    );
  }

  const percentualRealizado = (() => {
    if (historico.meta === null) return historico.realizado > 0 ? 100 : 0;
    if (historico.meta === 0) return 100;
    return Math.min(100, (historico.realizado / historico.meta) * 100);
  })();

  const naoRealizado = historico.meta ? Math.max(0, historico.meta - historico.realizado) : 0;

  return (
    <>
      <div className="flex flex-col items-center gap-4 border-b border-slate-800 p-6">
        <div className="text-center text-sm text-brand-muted">
          <p>Período: {formatarPeriodo(filtros.mes)}</p>
          <p>
            Meta: {historico.meta ?? "–"} Realizado: {historico.realizado}
          </p>
        </div>

        <PieChart
          fatias={[
            { valor: historico.meta !== null ? Math.min(historico.realizado, historico.meta) : historico.realizado, cor: "#00e676" },
            { valor: naoRealizado, cor: "#ef4444" },
          ]}
        />

        <p className="text-sm text-white">Visitas Realizadas: {percentualRealizado.toFixed(2)} %</p>

        <div className="flex items-center gap-5 text-xs text-brand-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-green" />
            Visitas Realizadas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Visitas não Realizadas
          </span>
        </div>
      </div>

      <DataTable
        columns={TABLE_COLUMNS}
        rows={historico.visitas.map((visita) => [
          formatarDataHoraVisita(visita.dataHora),
          visita.funcionario,
          visita.local,
          visita.temLocalizacao ? "Sim" : "",
          visita.motivoVisita,
          visita.observacao,
        ])}
        // Sem paginacao real (volume por mes/site e pequeno, ver comentario de
        // agruparPorVisita em queries.ts): page/totalPages fixos refletem "uma
        // pagina so", so pra rodape nao mostrar "0 de 0" com linhas visiveis.
        page={1}
        totalPages={historico.visitas.length > 0 ? 1 : 0}
        totalItems={historico.visitas.length}
        emptyTitle="Nenhuma visita encontrada"
        emptyDescription="Ajuste o período ou o local acima para localizar registros."
      />
    </>
  );
}
