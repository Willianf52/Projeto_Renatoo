import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { FilterTimePicker } from "@/components/dashboard/FilterTimePicker";
import { Skeleton } from "@/components/dashboard/Skeleton";
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

const LOCALIZACAO_OPTIONS = [
  { value: "com", label: "Com Localização" },
  { value: "sem", label: "Sem Localização" },
];

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
];

type SearchParamsPromise = Promise<SearchParams>;

/**
 * O `searchParams` NAO e aguardado aqui, e a funcao nao e `async`.
 *
 * Com `cacheComponents` ligado (next.config.ts), qualquer `await` no corpo da
 * pagina prende o shell inteiro ate o dado chegar -- foi o que o overlay
 * apontou como "uncached data during a navigation" em `getFilterOptions`. A
 * pagina passou a montar so a moldura (breadcrumb, cartao, titulo), que nao
 * depende de requisicao nenhuma e por isso entra no shell estatico, e cada
 * parte dinamica desceu para um `<Suspense>` proprio, recebendo a PROMESSA de
 * `searchParams` em vez do valor.
 *
 * As tres fronteiras sao separadas de proposito, e nao uma so em volta de
 * tudo: os filtros e a tabela vem de consultas independentes
 * (`getFilterOptions` e `getColetas`), entao uma fronteira unica faria a
 * tabela esperar pelos selects sem precisar. Separadas, cada uma pinta assim
 * que o seu dado chega.
 */
export default function ColetasImportadasPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
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
          <Suspense fallback={<AcoesEsqueleto />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto />}>
          <TabelaDeColetas searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Mesmos filtros da listagem, sem a paginacao -- getColetasParaExportar
 * ignora pagina de proposito (ver queries.ts).
 */
function montarQueryDeExportacao(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (chave === "pagina") continue;
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

/** Os dois botoes de exportar. Dependem so do `searchParams`, nao do banco --
 * por isso tem fronteira propria e resolvem antes das outras duas. */
async function AcoesDeExportacao({ searchParams }: { searchParams: SearchParamsPromise }) {
  const queryExportacao = montarQueryDeExportacao(await searchParams);

  return (
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
  );
}

/**
 * GET nativo: recarrega a pagina com os filtros na querystring, sem JS no
 * cliente. Os campos ja levam name/defaultValue combinando com os parametros
 * lidos em extrairFiltros.
 *
 * Grade de 6 colunas (a partir de xl), como na referencia: 16 celulas no
 * total (15 campos + Filtrar), Checkpoint vale 2 -- 17 -- mais o buraco
 * proposital depois de Qualificador fecham exatas 18 = 3 linhas x 6 colunas,
 * sem sobra nem furo indesejado. Em telas menores nao ha spans nem furos: 16
 * celulas dividem certo em 4, 2 ou 1 coluna.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getFilterOptions();

  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
    >
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
      <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
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

      {/* col-start-1 forca a quebra pra linha 2 na grade de 6 colunas,
          deixando a 6a celula da linha 1 vazia -- exatamente como na
          referencia. Sem isso o auto-flow do grid preencheria aquela
          celula com Hora Inicial em vez de pular a linha. */}
      <FilterTimePicker
        label="Hora Inicial"
        name="hora_inicial"
        defaultValue={filtros.horaInicial}
        className="xl:col-start-1"
      />
      <FilterTimePicker label="Hora Final" name="hora_final" defaultValue={filtros.horaFinal} />
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
      {/* Span so a partir de xl: nas colunas menores Checkpoint e uma
          celula normal (16 campos dividem certo em 4/2/1 coluna), entao
          nao ha risco do span sobrar sem a proxima linha pra descer
          inteiro -- o defeito que o comentario antigo evitava. */}
      <div className="xl:col-span-2">
        <FilterSelect
          label="Checkpoint"
          name="checkpoint"
          defaultValue={filtros.checkpoint}
          options={opcoes.checkpoints}
        />
      </div>

      {/* Ultima celula do grid, nao mais um irmao fora dele -- cai
          naturalmente no canto inferior direito, como na referencia. */}
      <Button type="submit" className="group">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeColetas({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const resultado = await getColetas(filtros);

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
  );
}

/**
 * Os tres fallbacks repetem a FORMA final de cada fronteira, nao um spinner:
 * mesmo criterio ja escrito em `dashboard/loading.tsx` -- a silhueta ocupa o
 * espaco definitivo, entao so o conteudo troca quando o dado chega, sem o
 * salto de layout que um spinner central provoca.
 */
function AcoesEsqueleto() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
    </div>
  );
}

/** 16 celulas: os 15 campos mais o botao Filtrar, na mesma grade do form. */
function FiltrosEsqueleto() {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 16 }).map((_, indice) => (
        <div key={indice} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function TabelaEsqueleto() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] border-collapse text-left text-sm">
        <tbody>
          {Array.from({ length: PAGE_SIZE > 8 ? 8 : PAGE_SIZE }).map((_, linha) => (
            <tr
              key={linha}
              className="animate-fade-in border-b border-slate-800/60"
              style={{ animationDelay: `${linha * 60}ms` }}
            >
              {TABLE_COLUMNS.map((coluna) => (
                <td key={coluna} className="px-4 py-3.5">
                  <Skeleton className="h-3 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
