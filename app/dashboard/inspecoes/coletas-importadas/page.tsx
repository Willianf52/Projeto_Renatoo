import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";
import {
  getColetas,
  getFilterOptions,
  toTableRow,
  extrairFiltros,
  primeiro,
  PAGE_SIZE,
  type SearchParams,
} from "./queries";

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

const LOCALIZACAO_OPTIONS = [
  { value: "com", label: "Com Localização" },
  { value: "sem", label: "Sem Localização" },
];

export default async function ColetasImportadasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [opcoes, resultado] = await Promise.all([getFilterOptions(), getColetas(filtros)]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Ultima coluna ("Ações") e so da tela: a exportacao (toTableRow) nao a tem.
  const rows = resultado.rows.map((leitura) => [...toTableRow(leitura), ""]);

  const buildPageHref = (pagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(pagina));
    return `?${query.toString()}`;
  };

  // Mesmos filtros da listagem, sem a paginacao -- getColetasParaExportar
  // ignora pagina de proposito (ver queries.ts).
  const queryExportacao = (() => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    const texto = query.toString();
    return texto ? `?${texto}` : "";
  })();

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
            <Acao
              titulo="Exportar para Excel"
              href={`/dashboard/inspecoes/coletas-importadas/export/excel${queryExportacao}`}
              className="bg-emerald-600/40"
              target="_blank"
            >
              <ExcelIcon className="h-4 w-4" />
            </Acao>
            <Acao
              titulo="Exportar para PDF"
              href={`/dashboard/inspecoes/coletas-importadas/export/pdf${queryExportacao}`}
              className="bg-red-600/40"
              target="_blank"
            >
              <PdfIcon className="h-4 w-4" />
            </Acao>
          </div>
        </div>

        {/* GET nativo: recarrega a pagina com os filtros na querystring, sem
            JS no cliente. Os campos ja levam name/defaultValue combinando com
            os parametros lidos em extrairFiltros. */}
        <form
          method="get"
          className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
        >
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <FilterInput label="Data Inicial" type="date" name="data_inicial" defaultValue={filtros.dataInicial} />
            <FilterInput label="Data Final" type="date" name="data_final" defaultValue={filtros.dataFinal} />
            <FilterSelect
              label="Localização"
              name="localizacao"
              defaultValue={filtros.localizacao}
              options={LOCALIZACAO_OPTIONS}
            />
            <FilterSelect
              label="Coletor de Dados"
              name="coletor_dados"
              defaultValue={filtros.coletorDados}
              options={opcoes.coletoresDados}
            />
            <FilterSelect
              label="Qualificador"
              name="qualificador"
              defaultValue={filtros.qualificador}
              options={opcoes.qualificadores}
            />

            <div className="flex min-w-0 gap-3 xl:col-span-2">
              <FilterInput label="Hora Inicial" type="time" name="hora_inicial" defaultValue={filtros.horaInicial} />
              <FilterInput label="Hora Final" type="time" name="hora_final" defaultValue={filtros.horaFinal} />
            </div>
            <FilterSelect
              label="Motivo Visita"
              name="motivo_visita"
              defaultValue={filtros.motivoVisita}
              options={opcoes.motivosVisita}
            />
            <FilterSelect
              label="Funcionários"
              name="funcionario"
              defaultValue={filtros.funcionario}
              options={opcoes.funcionarios}
            />
            <FilterSelect label="Locais" name="local" defaultValue={filtros.local} options={opcoes.locais} />
            <FilterSelect
              label="Grupos de Sites"
              name="grupo_site"
              defaultValue={filtros.grupoSite}
              options={opcoes.gruposSites}
            />

            <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
            <FilterSelect label="Tipo" name="tipo" defaultValue={filtros.tipo} options={opcoes.tipos} />
            <FilterSelect label="Áreas" name="area" defaultValue={filtros.area} options={opcoes.areas} />
            <div className="lg:col-span-2 2xl:col-span-1">
              <FilterSelect
                label="Checkpoint"
                name="checkpoint"
                defaultValue={filtros.checkpoint}
                options={opcoes.checkpoints}
              />
            </div>
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
          // getColetas conta com count=estimated; ver o comentario la.
          totalAproximado
          buildPageHref={buildPageHref}
        />
      </div>
    </div>
  );
}
