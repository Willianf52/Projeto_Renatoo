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
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Inspeções" }, { label: "Coletas Importadas" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FilterIcon className="h-4 w-4" />
            Coletas Importadas
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Exportar para Excel"
              aria-label="Exportar para Excel"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white transition-all duration-200 hover:bg-emerald-500 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-400 active:scale-95"
            >
              <ExcelIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Exportar para PDF"
              aria-label="Exportar para PDF"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-white transition-all duration-200 hover:bg-red-500 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-400 active:scale-95"
            >
              <PdfIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Campos em grade com o botao a direita, alinhado a ultima linha --
            mesma disposicao do sistema de referencia. A quinta coluna so entra
            em 2xl: em 1280px cada coluna ficaria com 126px e rotulos como
            "Coletor de Dados" (164px) seriam cortados no meio. */}
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <FilterInput label="Data Inicial" type="date" />
            <FilterInput label="Data Final" type="date" />
            <FilterSelect label="Localização" />
            <FilterSelect label="Coletor de Dados" />
            <FilterSelect label="Qualificador" />

            {/* A partir de xl as duas horas ocupam duas colunas: em uma so, a
                largura minima dos inputs de hora estoura a celula e invade o
                campo ao lado. Abaixo de xl as colunas ja sao largas o bastante
                e o span deixaria um buraco no meio da linha. */}
            <div className="flex min-w-0 gap-3 xl:col-span-2">
              <FilterInput label="Hora Inicial" type="time" />
              <FilterInput label="Hora Final" type="time" />
            </div>
            <FilterSelect label="Motivo Visita" />
            <FilterSelect label="Funcionários" />
            <FilterSelect label="Locais" />
            <FilterSelect label="Grupos de Sites" />

            <FilterSelect label="Eventos" />
            <FilterSelect label="Tipo" />
            <FilterSelect label="Áreas" />
            <div className="lg:col-span-2 2xl:col-span-1">
              <FilterSelect label="Checkpoint" />
            </div>
          </div>

          <button
            type="button"
            className="group flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] xl:w-52"
          >
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </button>
        </div>

        <DataTable columns={TABLE_COLUMNS} />
      </div>
    </div>
  );
}
