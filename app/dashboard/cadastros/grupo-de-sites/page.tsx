import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
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
import { getGruposSites, toTableRow, PAGE_SIZE, type GrupoSiteFiltros } from "./queries";

const TABLE_COLUMNS = ["ID", "Nome", "Status", "Descrição", "Ações"];

type SearchParams = Record<string, string | string[] | undefined>;

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
 * Botao ainda sem destino: desabilitado em vez de clicavel sem efeito, o mesmo
 * criterio da tela de Coletas Importadas.
 */
function AcaoEmBreve({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className: string;
  children: React.ReactNode;
}) {
  const rotulo = `${titulo} — em breve`;
  return (
    <button
      type="button"
      disabled
      title={rotulo}
      aria-label={rotulo}
      className={`flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-white/60 ${className}`}
    >
      {children}
    </button>
  );
}

export default async function GrupoDeSitesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const resultado = await getGruposSites(filtros);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  const rows = resultado.rows.map((grupo) => [
    ...toTableRow(grupo),
    <AcaoEmBreve key={grupo.id} titulo="Editar grupo" className="bg-white/10">
      <PencilIcon className="h-4 w-4" />
    </AcaoEmBreve>,
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
          {/* Mesma barra de acoes da tela antiga: importar, Excel, PDF e novo. */}
          <div className="flex items-center gap-2">
            <AcaoEmBreve titulo="Importar grupos" className="bg-sky-600/40">
              <UploadIcon className="h-4 w-4" />
            </AcaoEmBreve>
            <AcaoEmBreve titulo="Exportar para Excel" className="bg-emerald-600/40">
              <ExcelIcon className="h-4 w-4" />
            </AcaoEmBreve>
            <AcaoEmBreve titulo="Exportar para PDF" className="bg-red-600/40">
              <PdfIcon className="h-4 w-4" />
            </AcaoEmBreve>
            <AcaoEmBreve titulo="Novo grupo" className="bg-amber-500/40">
              <PlusCircleIcon className="h-4 w-4" />
            </AcaoEmBreve>
          </div>
        </div>

        {/* Mesmo mecanismo das demais telas: form GET, filtros na querystring,
            sem JS no cliente. */}
        <form
          method="get"
          className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
        >
          <div className="min-w-0 flex-1">
            <FilterInput label="Busca Livre..." name="busca" defaultValue={filtros.busca} />
          </div>

          <button
            type="submit"
            className="group flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] xl:w-52"
          >
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </button>
        </form>

        <DataTable
          columns={TABLE_COLUMNS}
          rows={rows}
          page={filtros.pagina}
          totalPages={totalPages}
          totalItems={resultado.totalItems}
          buildPageHref={buildPageHref}
          minWidth="min-w-[700px]"
          emptyTitle="Nenhum grupo de sites encontrado"
          emptyDescription="Ajuste a busca acima para localizar cadastros."
        />
      </div>
    </div>
  );
}
