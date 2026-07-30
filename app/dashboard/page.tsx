import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";

const TABLE_COLUMNS = [
  "Coleta",
  "Data / Hora",
  "Coletor de Dados",
  "Funcionário",
  "Local",
  "Área",
  "Evento",
  "Observação",
  "Ação",
  "Qualificador",
  "Data Integração",
  "Ações",
];

export default function ColetasImportadasPage() {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Coletas Importadas" }]} />

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 bg-brand-navy px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FilterIcon className="h-4 w-4" />
            Coletas Importadas
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Exportar para Excel"
              aria-label="Exportar para Excel"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-500"
            >
              <ExcelIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Exportar para PDF"
              aria-label="Exportar para PDF"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-white transition-colors hover:bg-red-500"
            >
              <PdfIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <FilterInput label="Data Inicial" type="date" />
          <FilterInput label="Data Final" type="date" />
          <FilterSelect label="Localização" />
          <FilterSelect label="Coletor de Dados" />
          <FilterSelect label="Qualificador" />
          <FilterInput label="Hora Inicial" type="time" />
          <FilterInput label="Hora Final" type="time" />
          <FilterSelect label="Motivo Visita" />
          <FilterSelect label="Funcionários" />
          <FilterSelect label="Locais" />
          <FilterSelect label="Grupos de Sites" />
          <FilterSelect label="Eventos" />
          <FilterSelect label="Tipo" />
          <FilterSelect label="Áreas" />
          <FilterSelect label="Checkpoint" />
          <button
            type="button"
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-brand-orange text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            <FilterIcon className="h-4 w-4" />
            Filtrar
          </button>
        </div>

        <DataTable columns={TABLE_COLUMNS} />
      </div>
    </div>
  );
}
