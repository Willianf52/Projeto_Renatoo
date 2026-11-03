import Link from "next/link";
import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FiltrosEmGradeEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { ClipboardListIcon, ExcelIcon, FilterIcon } from "@/components/dashboard/icons";
import { AGENDAMENTOS, corDoStatus, LISTAGEM, rotuloDoStatus, STATUS_DO_AGENDAMENTO } from "../agendas/regras";
import {
  extrairFiltros,
  getAgendamentos,
  getOpcoesDosFiltros,
  PAGE_SIZE,
  primeiro,
  type Agendamento,
  type Filtros,
  type SearchParams,
} from "./queries";

type SearchParamsPromise = Promise<SearchParams>;

const COLUNAS = ["Data Planejada", "Prazo", "Agenda", "Checklist", "Site", "Responsável", "Status", "Realizado em"];
const MIN_WIDTH = "min-w-[1100px]";
const HISTORICO = "/dashboard/checklistlab/historico-de-checklist";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const data = (iso: string) => DATA.format(new Date(`${iso}T12:00:00Z`));

/** "Agendamentos" do ChecklistLab (0084). Pagina sem `async` (Cache Components). */
export default function AgendamentosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Agendamentos" }]} />
      </div>
      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} linhas={8} minWidth={MIN_WIDTH} />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

function consultaDosFiltros(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v && chave !== "pagina") query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function Conteudo({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params, new Date());
  const agendamentos = await getAgendamentos(filtros);
  const pagina = agendamentos.slice((filtros.pagina - 1) * PAGE_SIZE, filtros.pagina * PAGE_SIZE);
  const consulta = consultaDosFiltros(params);

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardListIcon className="h-4 w-4" />
          Agendamentos
        </h1>
        <div className="flex items-center gap-2">
          <Acao titulo="Exportar para Excel" href={`${AGENDAMENTOS}/export/excel${consulta}`} tom="excel" target="_blank">
            <ExcelIcon className="h-4 w-4" />
          </Acao>
          <Link href={LISTAGEM} className="text-xs text-brand-green hover:underline">
            Criar Agenda
          </Link>
        </div>
      </div>

      <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={8} colunas="xl:grid-cols-4" />}>
        <FormularioDeFiltros filtros={filtros} />
      </Suspense>

      <ResumoPorStatus agendamentos={agendamentos} />

      <DataTable
        columns={COLUNAS}
        rows={pagina.map(celulas)}
        page={filtros.pagina}
        totalPages={Math.max(1, Math.ceil(agendamentos.length / PAGE_SIZE))}
        totalItems={agendamentos.length}
        buildPageHref={(p) => `${AGENDAMENTOS}${consultaDosFiltros({ ...params, pagina: undefined })}${
          consulta ? "&" : "?"
        }pagina=${p}`}
        emptyTitle="Nenhum agendamento no período"
        emptyDescription="Ajuste o período ou crie uma agenda em Criar Agenda."
        minWidth={MIN_WIDTH}
        rotulo="Agendamentos"
      />
    </>
  );
}

function ResumoPorStatus({ agendamentos }: { agendamentos: Agendamento[] }) {
  if (agendamentos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3 text-xs">
      {STATUS_DO_AGENDAMENTO.map((s) => (
        <span key={s.value} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${s.cor}`} aria-hidden />
          {s.label}: <strong className="text-white">{agendamentos.filter((a) => a.status === s.value).length}</strong>
        </span>
      ))}
    </div>
  );
}

function celulas(a: Agendamento): React.ReactNode[] {
  return [
    data(a.dataPlanejada),
    data(a.prazo),
    a.agenda,
    a.modelo,
    a.site,
    a.responsavel,
    <span key="status" className={`rounded px-2 py-0.5 text-xs font-semibold text-branco ${corDoStatus(a.status)}`}>
      {rotuloDoStatus(a.status)}
    </span>,
    a.checklistId && a.realizadoEm ? (
      <Link key="feito" href={`${HISTORICO}/${a.checklistId}`} className="text-brand-green hover:underline">
        {DATA_HORA.format(new Date(a.realizadoEm))}
      </Link>
    ) : (
      ""
    ),
  ];
}

async function FormularioDeFiltros({ filtros }: { filtros: Filtros }) {
  const opcoes = await getOpcoesDosFiltros();
  return (
    <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
      <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
      <FilterSelect label="Agendas" name="agenda" defaultValue={filtros.agenda} options={opcoes.agendas} />
      <FilterSelect label="Checklist" name="modelo" defaultValue={filtros.modelo} options={opcoes.modelos} />
      <FilterSelect label="Sites" name="site" defaultValue={filtros.site} options={opcoes.sites} />
      <FilterSelect label="Responsável" name="responsavel" defaultValue={filtros.responsavel} options={opcoes.usuarios} />
      <FilterSelect
        label="Status"
        name="status"
        defaultValue={filtros.status}
        options={STATUS_DO_AGENDAMENTO.map((s) => ({ value: s.value, label: s.label }))}
      />
      <div className="flex gap-2">
        <Button type="submit" className="group flex-1">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
        <Button href={AGENDAMENTOS} variant="secondary" className="flex-1">
          Limpar
        </Button>
      </div>
    </form>
  );
}
