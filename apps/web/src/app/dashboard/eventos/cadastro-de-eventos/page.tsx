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
  ExcelIcon,
  FilterIcon,
  MegaphoneIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
  UploadIcon,
} from "@/components/dashboard/icons";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { COLUNAS, extrairFiltros, getEventos, primeiro, SITUACOES, type SearchParams } from "./queries";
import { formatarMinutos, LISTAGEM } from "./regras";

const TABLE_COLUMNS = [...COLUNAS, "Ações"];
const MIN_WIDTH = "min-w-[1280px]";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function CadastroDeEventosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Evento salvo com sucesso." />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Configurações" }, { label: "Cadastro de Eventos" }]} />
      </div>

      <Suspense fallback={null}>
        <AvisoDePermissao />
      </Suspense>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MegaphoneIcon className="h-4 w-4" />
            Cadastro de Eventos
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={4} />}>
            <AcoesDoCabecalho searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeEventos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Escrita e e-mails so do GESTOR (0072). Sem o aviso, o SUPERVISOR veria os
 * botoes apagados e a coluna E-mails vazia sem saber por que. */
async function AvisoDePermissao() {
  if (await podeConfigurarEventos()) return null;
  return (
    <p className="rounded-lg border border-slate-800 bg-brand-surface px-4 py-3 text-sm text-brand-muted animate-fade-in">
      Você pode consultar os eventos. Cadastrar, editar e ver os e-mails é só para o nível Gestor.
    </p>
  );
}

function queryDosFiltros(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const chave of ["busca", "situacao"]) {
    const v = primeiro(params[chave]);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function AcoesDoCabecalho({ searchParams }: { searchParams: SearchParamsPromise }) {
  const query = queryDosFiltros(await searchParams);
  const podeEditar = await podeConfigurarEventos();

  return (
    <div className="flex items-center gap-2">
      <Acao titulo="Exportar para Excel" href={`${LISTAGEM}/export/excel${query}`} tom="excel" target="_blank">
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao titulo="Exportar para PDF" href={`${LISTAGEM}/export/pdf${query}`} tom="pdf" target="_blank">
        <PdfIcon className="h-4 w-4" />
      </Acao>
      {podeEditar ? (
        <>
          <Acao titulo="Importar Eventos" href={`${LISTAGEM}/importar`} tom="importar">
            <UploadIcon className="h-4 w-4" />
          </Acao>
          <Acao titulo="Novo evento" href={`${LISTAGEM}/novo`} tom="novo">
            <PlusCircleIcon className="h-4 w-4" />
          </Acao>
        </>
      ) : (
        <>
          <AcaoDesabilitada titulo="Importar Eventos" motivo="você não tem permissão" tom="importar">
            <UploadIcon className="h-4 w-4" />
          </AcaoDesabilitada>
          <AcaoDesabilitada titulo="Novo evento" motivo="você não tem permissão" tom="novo">
            <PlusCircleIcon className="h-4 w-4" />
          </AcaoDesabilitada>
        </>
      )}
    </div>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className="min-w-0 flex-1">
        <FilterInput label="Filtre por descrição ou código..." name="busca" defaultValue={filtros.busca} />
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

/** Ate tres sites pelo nome; o resto, contado. A lista inteira esta na edicao. */
function resumoDosSites(sites: { nome: string }[]): string {
  if (sites.length <= 3) return sites.map((s) => s.nome).join(", ");
  return `${sites
    .slice(0, 3)
    .map((s) => s.nome)
    .join(", ")} e mais ${sites.length - 3}`;
}

async function TabelaDeEventos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const [eventos, podeEditar] = await Promise.all([getEventos(filtros), podeConfigurarEventos()]);

  const linhas = eventos.map((e) => [
    String(e.id),
    e.nome,
    e.descricao,
    e.superior,
    resumoDosSites(e.sites),
    e.emails.join(", "),
    formatarMinutos(e.tempoAtendimentoMinutos),
    formatarMinutos(e.bloqueioRepeticaoMinutos),
    e.ativo ? "ATIVO" : "INATIVO",
    podeEditar ? (
      <Acao key="acoes" titulo={`Editar ${e.nome}`} href={`${LISTAGEM}/${e.id}/editar`} tom="neutro">
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada key="acoes" titulo={`Editar ${e.nome}`} motivo="você não tem permissão" tom="neutro">
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
  ]);

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      rows={linhas}
      page={1}
      totalPages={1}
      totalItems={eventos.length}
      minWidth={MIN_WIDTH}
      emptyTitle={filtros.busca ? "Nenhum evento encontrado" : "Nenhum evento nesta situação"}
      emptyDescription="Ajuste a busca ou o status acima."
    />
  );
}
