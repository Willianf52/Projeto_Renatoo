import { Suspense } from "react";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import {
  CorpoDeRelatorioEsqueleto,
  FiltrosEmGradeEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { BarChartIcon, ExcelIcon, FilterIcon, PdfIcon, SearchIcon } from "@/components/dashboard/icons";
import { extrairFiltros, getOpcoesFiltros, temPeriodo, type SearchParams } from "./queries";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function MapaDeEventosPorSitePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Mapa de Eventos por Site" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Mapa de Eventos por Site
          </h1>
          {/* Desabilitados ate existir o corpo do relatorio: exportar sem saber
              o formato do resultado seria inventar a planilha. */}
          <div className="flex items-center gap-2">
            <AcaoDesabilitada titulo="Exportar para Excel" className="bg-emerald-600/40">
              <ExcelIcon className="h-4 w-4" />
            </AcaoDesabilitada>
            <AcaoDesabilitada titulo="Exportar para PDF" className="bg-red-600/40">
              <PdfIcon className="h-4 w-4" />
            </AcaoDesabilitada>
          </div>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={8} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDoMapa searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * GET nativo, como as demais telas. Grade de 12 colunas no desktop para
 * reproduzir as duas linhas da referencia: Grupos Usuários (linha 1) e
 * Usuários (linha 2) comecam na mesma coluna, e o Filtrar fecha a segunda
 * linha a direita. Abaixo de `xl` vira grade simples de duas colunas.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-12">
      <div className="xl:col-span-2">
        <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
      </div>
      <div className="xl:col-span-2">
        <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
      </div>
      <div className="xl:col-span-2">
        {/* Sem situacao de tratativa no schema (Aguardando, Em Análise,
            Atendido...): visivel como na referencia, sem opcao -- mesma
            decisao do Registro e do Mapa de Eventos. */}
        <FilterSelect label="Status" name="status" options={[]} />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect
          label="Grupos Usuários"
          name="grupo_usuario"
          defaultValue={filtros.grupoUsuario}
          options={opcoes.gruposUsuarios}
        />
      </div>

      <div className="xl:col-span-3 xl:col-start-1">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
      </div>
      <div className="xl:col-span-4">
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>
      <Button type="submit" className="group w-full xl:col-span-2">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

/**
 * Por enquanto so o convite ao periodo. A referencia nao mostra nada abaixo
 * dos filtros antes de filtrar, e o formato do resultado (grade, grafico ou
 * mapa) ainda precisa de um print com dados para ser reproduzido.
 */
async function CorpoDoMapa({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 border-t border-slate-800 px-4 py-16 text-center animate-fade-in-up">
      <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
        <SearchIcon className="h-6 w-6" />
      </div>
      {temPeriodo(filtros) ? (
        <>
          <p className="text-sm font-medium text-white">Relatório em preparação</p>
          <p className="text-sm text-brand-muted">O resultado deste mapa ainda está sendo implementado.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-white">Selecione um período</p>
          <p className="text-sm text-brand-muted">
            Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver o mapa de eventos por site.
          </p>
        </>
      )}
    </div>
  );
}
