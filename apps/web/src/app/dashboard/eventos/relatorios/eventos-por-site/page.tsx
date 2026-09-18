import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import {
  CorpoDeRelatorioEsqueleto,
  FiltrosEmGradeEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { GraficoDeColunasEmpilhadas } from "@/components/dashboard/GraficoDeColunasEmpilhadas";
import { BarChartIcon, FilterIcon } from "@/components/dashboard/icons";
import { MenuDoGrafico } from "@/components/dashboard/MenuDoGrafico";
import {
  extrairFiltros,
  formatarData,
  getEventosPorSite,
  getOpcoesFiltros,
  montarSeries,
  paraPlanilha,
  type SearchParams,
} from "./queries";

const ID_DO_GRAFICO = "grafico-eventos-por-site";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function EventosPorSitePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Eventos por Site" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        {/* Sem botoes de Excel/PDF no cabecalho: a referencia nao os tem nesta
            tela -- a exportacao dela e o menu do proprio grafico. */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Eventos por Site
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={11} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDoGrafico searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * GET nativo, como as demais telas. Grade de 12 colunas no desktop para
 * reproduzir as linhas da referencia -- Status fecha a primeira linha na
 * mesma coluna em que Usuários e Grupos Usuários terminam -- e o Filtrar numa
 * faixa inteira por baixo, como la. Abaixo de `xl` vira grade de duas colunas.
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
      <div className="xl:col-span-4">
        <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
      </div>
      <div className="xl:col-span-2">
        {/* Sem situacao de tratativa no schema (Aguardando, Em Análise,
            Atendido...): visivel como na referencia, sem opcao -- mesma
            decisao das demais telas de Eventos. */}
        <FilterSelect label="Status" name="status" options={[]} />
      </div>

      <div className="xl:col-span-5 xl:col-start-1">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      </div>
      <div className="xl:col-span-5">
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>

      <div className="xl:col-span-2 xl:col-start-1">
        {/* Sem checklist ligado a evento no schema -- mesma decisao do Mapa de
            Eventos e do Registro das Rondas. */}
        <FilterSelect label="Checklists" name="checklist" options={[]} />
      </div>
      <div className="xl:col-span-2">
        <FilterSelect
          label="Atividades"
          name="atividade"
          defaultValue={filtros.atividade}
          options={opcoes.atividades}
        />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect
          label="Grupos Sites"
          name="grupo_site"
          defaultValue={filtros.grupoSite}
          options={opcoes.gruposSites}
        />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect
          label="Grupos Usuários"
          name="grupo_usuario"
          defaultValue={filtros.grupoUsuario}
          options={opcoes.gruposUsuarios}
        />
      </div>

      <Button type="submit" className="group w-full sm:col-span-2 xl:col-span-12">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

/**
 * O grafico, como na referencia: colunas empilhadas por Status, uma por site,
 * com titulo, periodo e "Total de Eventos" dentro do proprio desenho -- assim
 * a imagem baixada pelo menu sai completa.
 *
 * Sem periodo, so o cabecalho em branco ("até", "Total de Eventos:"), igual
 * la, e o convite a filtrar.
 */
async function CorpoDoGrafico({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const resultado = await getEventosPorSite(filtros);
  const periodo = `${filtros.dataInicial ? formatarData(filtros.dataInicial) : ""} até ${
    filtros.dataFinal ? formatarData(filtros.dataFinal) : ""
  }`;

  if (!resultado || resultado.sites.length === 0) {
    return (
      <div className="border-t border-slate-800 px-4 pb-10 pt-6 text-center">
        <h2 className="text-lg font-medium text-white">Eventos por Site</h2>
        <p className="mt-1 text-xs text-brand-muted">{periodo}</p>
        <p className="text-xs text-brand-muted">Total de Eventos: {resultado ? resultado.total : ""}</p>
        <p className="mt-8 text-sm text-brand-muted">
          {resultado
            ? "Nenhum evento no período. Ajuste as datas ou os filtros acima."
            : "Escolha a Data Inicial e a Data Final acima e clique em Filtrar."}
        </p>
      </div>
    );
  }

  const { colunas, linhas } = paraPlanilha(resultado.sites);

  return (
    <div className="relative border-t border-slate-800 p-4">
      <div className="absolute right-4 top-4 z-10">
        <MenuDoGrafico idDoGrafico={ID_DO_GRAFICO} nomeDoArquivo="eventos-por-site" colunas={colunas} linhas={linhas} />
      </div>
      <div
        role="region"
        aria-label="Gráfico de eventos por site"
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        <GraficoDeColunasEmpilhadas
          id={ID_DO_GRAFICO}
          titulo="Eventos por Site"
          subtitulos={[periodo, `Total de Eventos: ${resultado.total}`]}
          categorias={resultado.sites.map((site) => ({
            rotulo: site.siteNome,
            dica: site.siteNiveis.join(" > "),
          }))}
          series={montarSeries(resultado.sites)}
          tituloEixoY="Quantidade"
        />
      </div>
    </div>
  );
}
