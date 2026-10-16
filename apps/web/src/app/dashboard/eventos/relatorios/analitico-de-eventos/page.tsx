import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmGradeEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import {
  ChevronRightIcon,
  ClipboardListIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import {
  extrairFiltros,
  formatarDia,
  getAnalitico,
  getOpcoesFiltros,
  primeiro,
  TABLE_COLUMNS,
  type SearchParams,
} from "./queries";

const MIN_WIDTH = "min-w-[1100px]";
const ROTA = "/dashboard/eventos/relatorios/analitico-de-eventos";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function AnaliticoDeEventosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Analítico de Eventos" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Analítico de Eventos
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={7} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} linhas={6} minWidth={MIN_WIDTH} />}>
          <CorpoDoAnalitico searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

function montarQueryDeExportacao(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function AcoesDeExportacao({ searchParams }: { searchParams: SearchParamsPromise }) {
  const queryExportacao = montarQueryDeExportacao(await searchParams);

  return (
    <div className="flex items-center gap-2">
      <Acao titulo="Exportar para Excel" href={`${ROTA}/export/excel${queryExportacao}`} className="bg-emerald-600/40" target="_blank">
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao titulo="Exportar para PDF" href={`${ROTA}/export/pdf${queryExportacao}`} className="bg-red-600/40" target="_blank">
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

/** Mesmo desenho da referencia: datas e Sites na primeira linha; Eventos,
 * Grupos Usuarios, Usuarios e o Filtrar na segunda. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="space-y-3 border-b border-slate-800 p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        </div>
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect
            label="Grupos Usuários"
            name="grupo_usuario"
            defaultValue={filtros.grupoUsuario}
            options={opcoes.grupos}
          />
        </div>
        <div className="min-w-0 flex-1">
          <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
        </div>
        <Button type="submit" className="group w-full lg:w-40">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
      </div>
    </form>
  );
}

async function CorpoDoAnalitico({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const linhas = await getAnalitico(filtros, new Date());

  if (!linhas) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-16 text-center animate-fade-in-up">
        <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
          <SearchIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-white">Selecione um período</p>
        <p className="text-sm text-brand-muted">
          Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver o analítico de eventos.
        </p>
      </div>
    );
  }

  // Sem paginacao, como na referencia: uma tabela so com o periodo inteiro.
  const total = linhas.reduce((soma, l) => soma + l.quantidade, 0);

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      rows={linhas.map((l) => [
        formatarDia(l.dia),
        <CaminhoDoSite key="local" niveis={l.siteNiveis} />,
        l.usuario,
        l.duracao,
        `${l.horas} horas`,
        l.evento,
        <span key="qtd" className="flex justify-center">
          {l.quantidade}
        </span>,
      ])}
      rodape={[
        "TOTAL:",
        "",
        "",
        "",
        "",
        "",
        <span key="qtd" className="flex justify-center">
          {total}
        </span>,
      ]}
      page={1}
      totalPages={1}
      totalItems={linhas.length}
      emptyTitle="Nenhum evento encontrado"
      emptyDescription="Ajuste o período ou os filtros acima para localizar registros."
      minWidth={MIN_WIDTH}
      rotulo="Analítico de eventos"
    />
  );
}

/** "UP Serviços > Grupo > Site", como no Registro de Eventos. */
function CaminhoDoSite({ niveis }: { niveis: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {niveis.map((nivel, indice) => {
        const ultimo = indice === niveis.length - 1;
        return (
          <span key={indice} className="inline-flex items-center gap-1">
            {indice > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-brand-muted" aria-hidden />}
            <span className={ultimo ? "text-white" : "text-brand-muted"}>{nivel}</span>
          </span>
        );
      })}
    </span>
  );
}
