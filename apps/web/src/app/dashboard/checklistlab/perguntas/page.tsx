import { Suspense } from "react";
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
import { getPerguntas, toTableRow, PAGE_SIZE, type PerguntaFiltros } from "./queries";

const TABLE_COLUMNS = ["Ordem", "Pergunta", "Status", "Ações"];
const MIN_WIDTH = "min-w-[640px]";

/** Busca ocupa a sobra, Status fica com a mesma largura do botao Filtrar. */
const GRADE_DE_FILTROS = "grid grid-cols-1 gap-3 xl:grid-cols-[1fr_13rem]";

const STATUS_OPCOES = [
  { value: "ativo", label: "Ativa" },
  { value: "inativo", label: "Inativa" },
];

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): PerguntaFiltros {
  return {
    busca: primeiro(params.busca),
    status: primeiro(params.status),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function PerguntasDoChecklistPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Perguntas do Checklist" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Perguntas do Checklist
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <AcaoDeNovaPergunta />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={2} gradeInterna={GRADE_DE_FILTROS} />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDePerguntas searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Sem exportar Excel/PDF aqui, ao contrario dos cadastros de Cadastros: este e
 * um cadastro de configuracao com dezenas de linhas, nao um relatorio
 * operacional que alguem leva para reuniao. Entram quando alguem pedir.
 */
async function AcaoDeNovaPergunta() {
  return (await podeAdministrarCadastros()) ? (
    <Acao
      titulo="Nova pergunta"
      href="/dashboard/checklistlab/perguntas/novo"
      className="bg-amber-500/80"
    >
      <PlusCircleIcon className="h-4 w-4" />
    </Acao>
  ) : (
    <AcaoDesabilitada
      titulo="Nova pergunta"
      motivo="você não tem permissão"
      className="bg-amber-500/40"
    >
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

/** Form GET, filtros na querystring, sem JS no caminho critico -- mesmo
 * mecanismo das demais listagens. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className={`min-w-0 flex-1 ${GRADE_DE_FILTROS}`}>
        <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
        <FilterSelect
          label="Status"
          name="status"
          options={STATUS_OPCOES}
          defaultValue={filtros.status}
        />
      </div>

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDePerguntas({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getPerguntas(filtros),
    podeAdministrarCadastros(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: esconde-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que. Mesma decisao das
  // demais listagens de cadastro.
  const rows = resultado.rows.map((pergunta) => [
    ...toTableRow(pergunta),
    podeAdministrar ? (
      <Acao
        key={pergunta.id}
        titulo={`Editar pergunta ${pergunta.ordem}`}
        href={`/dashboard/checklistlab/perguntas/${pergunta.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={pergunta.id}
        titulo="Editar pergunta"
        motivo="você não tem permissão"
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
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
      emptyTitle="Nenhuma pergunta cadastrada"
      emptyDescription="As perguntas cadastradas aqui são as que o inspetor responde ao escolher Consultoria no app de campo."
    />
  );
}
