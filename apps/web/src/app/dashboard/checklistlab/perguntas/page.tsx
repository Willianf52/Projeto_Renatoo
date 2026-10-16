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
  ChevronDownIcon,
  ClipboardListIcon,
  FilterIcon,
  PencilIcon,
  PlusCircleIcon,
  UploadIcon,
} from "@/components/dashboard/icons";
import { podeEditarChecklist } from "@/lib/permissoes";
import { getOpcoesDeModelos } from "../modelos/queries";
import { moverPergunta } from "./actions";
import { getPerguntas, modeloDoFiltro, toTableRow, PAGE_SIZE, type PerguntaFiltros, type PerguntaRow } from "./queries";
import { CLASSES_DO_TOM, HOVER_DO_TOM } from "@/components/dashboard/tons-de-acao";

const TABLE_COLUMNS = ["Checklist", "Ordem", "Pergunta", "Grupo", "Respostas", "Tipo de Evento", "Status", "Ações"];
const MIN_WIDTH = "min-w-[1100px]";

/** Modelo e busca dividem a sobra; Status fica com a largura do botao Filtrar. */
const GRADE_DE_FILTROS = "grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_13rem]";

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
    modelo: primeiro(params.modelo),
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
      <Suspense fallback={null}>
        <AvisoDeSalvo
          searchParams={searchParams}
          listagem="/dashboard/checklistlab/perguntas"
          mensagem="Pergunta salva com sucesso."
        />
      </Suspense>

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
            <AcaoDeNovaPergunta searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={3} gradeInterna={GRADE_DE_FILTROS} />}>
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
async function AcaoDeNovaPergunta({ searchParams }: { searchParams: SearchParamsPromise }) {
  // Com a listagem filtrada por modelo, a pergunta nova nasce nele.
  const modelo = modeloDoFiltro(extrairFiltros(await searchParams).modelo);
  const href = `/dashboard/checklistlab/perguntas/novo${modelo === null ? "" : `?modelo=${modelo}`}`;

  return (await podeEditarChecklist()) ? (
    <div className="flex items-center gap-2">
      {/* Importar e por checklist: as perguntas do arquivo entram no fim dele. */}
      {modelo !== null && (
        <Acao
          titulo="Importar perguntas"
          href={`/dashboard/checklistlab/perguntas/importar?modelo=${modelo}`} tom="importar"
        >
          <UploadIcon className="h-4 w-4" />
        </Acao>
      )}
      <Acao titulo="Nova pergunta" href={href} tom="novo">
        <PlusCircleIcon className="h-4 w-4" />
      </Acao>
    </div>
  ) : (
    <AcaoDesabilitada
      titulo="Nova pergunta"
      motivo="você não tem permissão" tom="novo"
    >
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

/** Form GET, filtros na querystring, sem JS no caminho critico -- mesmo
 * mecanismo das demais listagens. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const [params, modelos] = await Promise.all([searchParams, getOpcoesDeModelos()]);
  const filtros = extrairFiltros(params);

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className={`min-w-0 flex-1 ${GRADE_DE_FILTROS}`}>
        <FilterSelect
          label="Modelo"
          name="modelo"
          options={modelos.map(({ value, label }) => ({ value, label }))}
          defaultValue={filtros.modelo}
        />
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
    podeEditarChecklist(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: esconde-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que. Mesma decisao das
  // demais listagens de cadastro.
  // As setas so com a lista filtrada por um checklist: e a ordem DELE que
  // muda, e sem o filtro a vizinha na tela pode ser de outro modelo.
  const filtradoPorModelo = modeloDoFiltro(filtros.modelo) !== null;

  const rows = resultado.rows.map((pergunta) => [
    ...toTableRow(pergunta).slice(0, 3),
    <Grupo key="grupo" pergunta={pergunta} />,
    ...toTableRow(pergunta).slice(3),
    podeAdministrar ? (
      <div key={pergunta.id} className="flex items-center gap-2">
        <Acao
          titulo={`Editar pergunta ${pergunta.ordem} de ${pergunta.modelo}`}
          href={`/dashboard/checklistlab/perguntas/${pergunta.id}/editar`} tom="neutro"
        >
          <PencilIcon className="h-4 w-4" />
        </Acao>
        {filtradoPorModelo && (
          <>
            <BotaoDeMover pergunta={pergunta} direcao="cima" />
            <BotaoDeMover pergunta={pergunta} direcao="baixo" />
          </>
        )}
      </div>
    ) : (
      <AcaoDesabilitada
        key={pergunta.id}
        titulo="Editar pergunta"
        motivo="você não tem permissão" tom="neutro"
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
      emptyDescription="Cada pergunta pertence a um modelo de checklist. O inspetor responde as do modelo do grupo do site ao escolher Consultoria no app de campo."
    />
  );
}

/** Nome do grupo com a cor dele, como a coluna "Grupo" da referencia. */
function Grupo({ pergunta }: { pergunta: PerguntaRow }) {
  if (!pergunta.grupo) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {pergunta.grupoCor && (
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-sm border border-white/20"
          style={{ backgroundColor: pergunta.grupoCor }}
        />
      )}
      {pergunta.grupo}
    </span>
  );
}

/** Form POST, sem JS: a action troca com a vizinha e volta para esta lista. */
function BotaoDeMover({ pergunta, direcao }: { pergunta: PerguntaRow; direcao: "cima" | "baixo" }) {
  const titulo = `Mover a pergunta ${pergunta.ordem} para ${direcao === "cima" ? "cima" : "baixo"}`;
  return (
    <form action={moverPergunta}>
      <input type="hidden" name="id" value={pergunta.id} />
      <input type="hidden" name="modelo" value={pergunta.modeloId} />
      <input type="hidden" name="direcao" value={direcao} />
      <button
        type="submit"
        title={titulo}
        aria-label={titulo}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 ${CLASSES_DO_TOM.neutro} ${HOVER_DO_TOM.neutro} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface active:scale-[0.97]`}
      >
        <ChevronDownIcon className={`h-4 w-4 ${direcao === "cima" ? "rotate-180" : ""}`} />
      </button>
    </form>
  );
}
