import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { FilterIcon, UploadIcon } from "@/components/dashboard/icons";
import {
  extrairFiltros,
  getImportacoes,
  primeiro,
  toTableRow,
  PAGE_SIZE,
  STATUS_OPTIONS,
  type SearchParams,
} from "./queries";

const TABLE_COLUMNS = [
  "Recebido em",
  "Status",
  "HTTP",
  "Origem",
  "Linhas Recebidas",
  "Visitas Gravadas",
  "Leituras Novas",
  "Mensagem",
];

export default async function ImportacoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const resultado = await getImportacoes(filtros);
  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));
  const rows = resultado.rows.map(toTableRow);

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
        <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Importações" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <UploadIcon className="h-4 w-4" />
            Importações
          </h1>
        </div>

        {/* GET nativo, mesmo mecanismo das demais telas. */}
        <form
          method="get"
          className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
          <FilterSelect label="Status" name="status" defaultValue={filtros.status} options={STATUS_OPTIONS} />
          <Button type="submit" className="group self-end">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </form>

        <DataTable
          columns={TABLE_COLUMNS}
          rows={rows}
          page={filtros.pagina}
          totalPages={totalPages}
          totalItems={resultado.totalItems}
          buildPageHref={buildPageHref}
          emptyTitle="Nenhuma importação encontrada"
          emptyDescription="Ajuste o período ou o status acima para localizar tentativas de lote."
          minWidth="min-w-[1024px]"
        />
      </div>
    </div>
  );
}
