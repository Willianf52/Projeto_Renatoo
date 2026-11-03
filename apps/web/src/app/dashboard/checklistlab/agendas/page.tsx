import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmLinhaEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  ClipboardListIcon,
  FilterIcon,
  PencilIcon,
  PlusCircleIcon,
  SearchIcon,
  UploadIcon,
} from "@/components/dashboard/icons";
import { podeEditarChecklist } from "@/lib/permissoes";
import { excluirAgenda } from "./actions";
import { listarAgendas, type Situacao } from "./queries";
import { AGENDAMENTOS, LISTAGEM, rotuloDaRecorrencia } from "./regras";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

/** As colunas da lista de agendas do sistema de referencia. */
const COLUNAS = [
  "ID",
  "Nome Agenda",
  "Checklist",
  "Data Planejada",
  "Recorrência",
  "Agendamentos",
  "Tolerância",
  "Responsável",
  "Grupo Usuários",
  "Site",
  "Status",
  "Ações",
];
const MIN_WIDTH = "min-w-[1200px]";
const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "todos", label: "Todos" },
  { value: "inativos", label: "Inativos" },
];

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const data = (iso: string) => DATA.format(new Date(`${iso}T12:00:00Z`));

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function filtrosDe(params: SearchParams): { situacao: Situacao; busca?: string } {
  const s = primeiro(params.situacao);
  return {
    situacao: s === "todos" || s === "inativos" ? s : "ativos",
    busca: primeiro(params.busca)?.slice(0, 100),
  };
}

/** "Criar Agenda" do ChecklistLab (0084). Pagina sem `async` (Cache Components). */
export default function AgendasPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Agenda salva com sucesso." />
      </Suspense>
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Agenda excluída." parametro="excluido" />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Administração" }, { label: "Criar Agenda" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Agendas
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <Acoes />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeAgendas searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Acoes() {
  const pode = await podeEditarChecklist();
  return (
    <div className="flex items-center gap-2">
      <Acao titulo="Agendamentos" href={AGENDAMENTOS} tom="neutro">
        <SearchIcon className="h-4 w-4" />
      </Acao>
      {pode ? (
        <>
          {/* O upload de agendas do sistema de referencia, com as mesmas colunas. */}
          <Acao titulo="Importar Agendas" href={`${LISTAGEM}/importar`} tom="importar">
            <UploadIcon className="h-4 w-4" />
          </Acao>
          <Acao titulo="Nova agenda" href={`${LISTAGEM}/novo`} tom="novo">
            <PlusCircleIcon className="h-4 w-4" />
          </Acao>
        </>
      ) : (
        <AcaoDesabilitada titulo="Nova agenda" motivo="você não tem permissão" tom="novo">
          <PlusCircleIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = filtrosDe(await searchParams);
  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className="min-w-0 flex-1">
        <FilterInput label="Busca Livre (agenda ou checklist)" name="busca" defaultValue={filtros.busca} />
      </div>
      <div className="w-full xl:w-48">
        <FilterSelect label="Status" name="situacao" defaultValue={filtros.situacao} options={SITUACOES} semOpcaoVazia />
      </div>
      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeAgendas({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = filtrosDe(await searchParams);
  const [agendas, pode] = await Promise.all([listarAgendas(filtros), podeEditarChecklist()]);

  const linhas = agendas.map((a) => [
    String(a.id),
    a.nome,
    a.checklist,
    `${data(a.dataInicial)} até ${data(a.dataFinal)}`,
    rotuloDaRecorrencia(a.recorrencia),
    String(a.agendamentos),
    a.toleranciaDias === 1 ? "1 dia" : `${a.toleranciaDias} dias`,
    a.responsavel,
    a.grupo,
    a.sites.length === 1 ? a.sites[0].nome : `${a.sites.length} sites`,
    a.ativo ? "Ativo" : "Inativo",
    pode ? (
      <div key="acoes" className="flex items-center gap-1">
        <Acao titulo={`Editar ${a.nome}`} href={`${LISTAGEM}/${a.id}/editar`} tom="neutro">
          <PencilIcon className="h-4 w-4" />
        </Acao>
        <Acao titulo={`Agendamentos de ${a.nome}`} href={`${AGENDAMENTOS}?agenda=${a.id}`} tom="neutro">
          <SearchIcon className="h-4 w-4" />
        </Acao>
        {/* "Exclusão Física da Agenda" do antigo. */}
        <form action={excluirAgenda}>
          <input type="hidden" name="id" value={a.id} />
          <button
            type="submit"
            title={`Excluir ${a.nome}`}
            aria-label={`Excluir ${a.nome}`}
            className="flex h-8 items-center justify-center rounded-md px-2 text-xs text-red-300 transition-colors hover:bg-red-500/10"
          >
            Excluir
          </button>
        </form>
      </div>
    ) : (
      ""
    ),
  ]);

  return (
    <DataTable
      columns={COLUNAS}
      rows={linhas}
      page={1}
      totalPages={1}
      totalItems={agendas.length}
      buildPageHref={() => LISTAGEM}
      emptyTitle="Nenhuma agenda encontrada"
      emptyDescription="Crie uma agenda para planejar checklists por site."
      minWidth={MIN_WIDTH}
      rotulo="Agendas"
    />
  );
}
