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
import { FilterIcon, GridIcon, PencilIcon, PlusCircleIcon } from "@/components/dashboard/icons";
import { podeEditarChecklist } from "@/lib/permissoes";
import { listarGrupos } from "./queries";
import { LISTAGEM, situacaoDe } from "./regras";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

const COLUNAS = ["Ordem", "Grupo", "Cor", "Perguntas", "Status", "Ações"];
const MIN_WIDTH = "min-w-[720px]";
const SITUACOES = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function filtrosDe(params: SearchParams) {
  return { situacao: situacaoDe(primeiro(params.situacao)), busca: primeiro(params.busca)?.slice(0, 100) };
}

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function GrupoPerguntasPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Grupo de perguntas salvo com sucesso." />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Administração" }, { label: "Grupo Perguntas" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <GridIcon className="h-4 w-4" />
            Grupo de Perguntas
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <BotaoNovo />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeGrupos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function BotaoNovo() {
  return (await podeEditarChecklist()) ? (
    <Acao titulo="Novo grupo de perguntas" href={`${LISTAGEM}/novo`} tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </Acao>
  ) : (
    <AcaoDesabilitada titulo="Novo grupo de perguntas" motivo="você não tem permissão" tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = filtrosDe(await searchParams);
  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className="min-w-0 flex-1">
        <FilterInput label="Busca Livre (descrição)" name="busca" defaultValue={filtros.busca} />
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

async function TabelaDeGrupos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = filtrosDe(await searchParams);
  const [grupos, podeEditar] = await Promise.all([listarGrupos(filtros), podeEditarChecklist()]);

  const linhas = grupos.map((g) => [
    String(g.ordem),
    g.nome,
    g.cor ? (
      <span key="cor" className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-4 w-16 rounded border border-white/20" style={{ backgroundColor: g.cor }} />
        <span className="font-mono text-xs text-brand-muted">{g.cor}</span>
      </span>
    ) : (
      ""
    ),
    String(g.perguntas),
    g.ativo ? "Ativo" : "Inativo",
    podeEditar ? (
      <Acao key="acoes" titulo={`Editar ${g.nome}`} href={`${LISTAGEM}/${g.id}/editar`} tom="neutro">
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada key="acoes" titulo={`Editar ${g.nome}`} motivo="você não tem permissão" tom="neutro">
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
  ]);

  return (
    <DataTable
      columns={COLUNAS}
      rows={linhas}
      page={1}
      totalPages={1}
      totalItems={grupos.length}
      minWidth={MIN_WIDTH}
      emptyTitle="Nenhum grupo de perguntas"
      emptyDescription="O grupo organiza as perguntas do checklist: cada pergunta pode apontar para um, na edição dela."
    />
  );
}
