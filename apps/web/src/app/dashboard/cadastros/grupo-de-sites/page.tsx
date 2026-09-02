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
import { FilterInput } from "@/components/dashboard/FilterField";
import {
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
  SitemapIcon,
  UploadIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { getGruposSites, toTableRow, PAGE_SIZE, type GrupoSiteFiltros } from "./queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição", "Ações"];
const MIN_WIDTH = "min-w-[700px]";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): GrupoSiteFiltros {
  return {
    busca: primeiro(params.busca),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/**
 * Pagina sem `async` e sem `await` no corpo -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx`, a primeira tela convertida, para o
 * porque (Cache Components: um `await` aqui prende o shell inteiro).
 *
 * `podeAdministrarCadastros()` e pedido pela barra de acoes e pela coluna
 * "Ações" da tabela, que agora vivem em fronteiras diferentes. Nao vira dois
 * round-trips: a funcao e memoizada por requisicao com `cache()` -- ver
 * `lib/permissoes.ts`.
 */
export default function GrupoDeSitesPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Grupo de Sites" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SitemapIcon className="h-4 w-4" />
            Grupo de Sites
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={4} />}>
            <AcoesDoCabecalho searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeGrupos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mesma barra de acoes da tela antiga: importar, Excel, PDF e novo. */
async function AcoesDoCabecalho({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const podeAdministrar = await podeAdministrarCadastros();

  // Mesmo filtro de busca da listagem, sem a paginacao --
  // getGruposSitesParaExportar ignora pagina de proposito (ver queries.ts).
  const queryExportacao = filtros.busca ? `?busca=${encodeURIComponent(filtros.busca)}` : "";

  return (
    <div className="flex items-center gap-2">
      <AcaoDesabilitada titulo="Importar grupos" className="bg-sky-600/40">
        <UploadIcon className="h-4 w-4" />
      </AcaoDesabilitada>
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/cadastros/grupo-de-sites/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/cadastros/grupo-de-sites/export/pdf${queryExportacao}`}
        className="bg-red-600/40"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
      {podeAdministrar ? (
        <Acao
          titulo="Novo grupo"
          href="/dashboard/cadastros/grupo-de-sites/novo"
          className="bg-amber-500/80"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </Acao>
      ) : (
        <AcaoDesabilitada
          titulo="Novo grupo"
          motivo="você não tem permissão"
          className="bg-amber-500/40"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>
  );
}

/** Mesmo mecanismo das demais telas: form GET, filtros na querystring, sem JS
 * no cliente. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className="min-w-0 flex-1">
        <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
      </div>

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeGrupos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getGruposSites(filtros),
    podeAdministrarCadastros(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que.
  const rows = resultado.rows.map((grupo) => [
    ...toTableRow(grupo),
    podeAdministrar ? (
      <Acao
        key={grupo.id}
        titulo={`Editar ${grupo.nome}`}
        href={`/dashboard/cadastros/grupo-de-sites/${grupo.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={grupo.id}
        titulo="Editar grupo"
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
      emptyTitle="Nenhum grupo de sites encontrado"
      emptyDescription="Ajuste a busca acima para localizar cadastros."
    />
  );
}
