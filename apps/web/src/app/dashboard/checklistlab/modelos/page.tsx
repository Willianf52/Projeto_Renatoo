import { Suspense } from "react";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
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
} from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { getModelos, toTableRow, PAGE_SIZE, type ModeloFiltros } from "./queries";

const TABLE_COLUMNS = ["Modelo", "Grupos de Sites", "Perguntas", "Status", "Ações"];
const MIN_WIDTH = "min-w-[760px]";

/** Busca ocupa a sobra, Status fica com a mesma largura do botao Filtrar. */
const GRADE_DE_FILTROS = "grid grid-cols-1 gap-3 xl:grid-cols-[1fr_13rem]";

const STATUS_OPCOES = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

const LISTAGEM = "/dashboard/checklistlab/modelos";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): ModeloFiltros {
  return {
    busca: primeiro(params.busca),
    status: primeiro(params.status),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function ModelosDeChecklistPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Modelo salvo com sucesso." />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Modelos de Checklist" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Modelos de Checklist
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <AcaoDeNovoModelo />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={2} gradeInterna={GRADE_DE_FILTROS} />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeModelos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function AcaoDeNovoModelo() {
  return (await podeAdministrarCadastros()) ? (
    <Acao titulo="Novo modelo" href={`${LISTAGEM}/novo`} className="bg-amber-500/80">
      <PlusCircleIcon className="h-4 w-4" />
    </Acao>
  ) : (
    <AcaoDesabilitada titulo="Novo modelo" motivo="você não tem permissão" className="bg-amber-500/40">
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className={`min-w-0 flex-1 ${GRADE_DE_FILTROS}`}>
        <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
        <FilterSelect label="Status" name="status" options={STATUS_OPCOES} defaultValue={filtros.status} />
      </div>

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeModelos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([getModelos(filtros), podeAdministrarCadastros()]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // "Perguntas" abre a listagem de perguntas ja filtrada pelo modelo: e dali
  // que se cadastra pergunta nele. Aberta a todos, porque ler e permitido a
  // quem ve a tela; so editar depende de permissao.
  const rows = resultado.rows.map((modelo) => [
    ...toTableRow(modelo),
    <div key={modelo.id} className="flex items-center gap-1.5">
      <Acao
        titulo={`Perguntas de ${modelo.nome}`}
        href={`/dashboard/checklistlab/perguntas?modelo=${modelo.id}`}
        className="bg-white/10"
      >
        <ClipboardListIcon className="h-4 w-4" />
      </Acao>
      {podeAdministrar ? (
        <Acao titulo={`Editar ${modelo.nome}`} href={`${LISTAGEM}/${modelo.id}/editar`} className="bg-white/10">
          <PencilIcon className="h-4 w-4" />
        </Acao>
      ) : (
        <AcaoDesabilitada titulo="Editar modelo" motivo="você não tem permissão" className="bg-white/10">
          <PencilIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>,
  ]);

  const buildPageHref = (pagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(pagina));
    return `?${query.toString()}`;
  };

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      rows={rows}
      page={filtros.pagina}
      totalPages={totalPages}
      totalItems={resultado.totalItems}
      buildPageHref={buildPageHref}
      minWidth={MIN_WIDTH}
      emptyTitle="Nenhum modelo encontrado"
      emptyDescription="Cada modelo é uma lista de perguntas, respondida pelos sites dos grupos ligados a ele."
    />
  );
}
