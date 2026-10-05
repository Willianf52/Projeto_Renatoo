import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { CorpoDeRelatorioEsqueleto, FiltrosEmGradeEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { GraficoDePareto } from "@/components/dashboard/GraficoDePareto";
import { BarChartIcon, FilterIcon } from "@/components/dashboard/icons";
import { MenuDoGrafico } from "@/components/dashboard/MenuDoGrafico";
import {
  extrairFiltros,
  formatarData,
  getOpcoesFiltros,
  getRanking,
  paraPlanilha,
  type SearchParams,
} from "./queries";

const ID_DO_GRAFICO = "ranking-das-nao-conformidades";

type SearchParamsPromise = Promise<SearchParams>;

/**
 * Ranking das Nao Conformidades (item 3 do plano da #164): o Pareto por tipo
 * de evento. A regra e a consulta estao em `queries.ts`; o desenho, em
 * `GraficoDePareto`.
 *
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components).
 */
export default function RankingDasNaoConformidadesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Ranking das Não Conformidades" }]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Relatório de Ranking das Não Conformidades
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={11} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDoRanking searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** GET nativo, na mesma faixa de filtros da tela de Graficos de Eventos. */
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
        {/* Ate o item 5 do plano, toda ocorrencia nasce "Aguardando": o campo
            fica visivel, como na referencia, mas sem opcao. */}
        <FilterSelect label="Status" name="status" options={[]} />
      </div>

      <div className="xl:col-span-5 xl:col-start-1">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      </div>
      <div className="xl:col-span-5">
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>

      <div className="xl:col-span-2 xl:col-start-1">
        <FilterSelect label="Checklists" name="checklist" options={[]} />
      </div>
      <div className="xl:col-span-2">
        <FilterSelect label="Atividades" name="atividade" defaultValue={filtros.atividade} options={opcoes.atividades} />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect label="Grupos Sites" name="grupo_site" defaultValue={filtros.grupoSite} options={opcoes.gruposSites} />
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

async function CorpoDoRanking({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const ranking = await getRanking(filtros);

  const periodo = `${filtros.dataInicial ? formatarData(filtros.dataInicial) : ""} até ${
    filtros.dataFinal ? formatarData(filtros.dataFinal) : ""
  }`;
  const subtitulos = [periodo, `Total Geral: ${ranking ? ranking.total : ""}`];

  // Sem periodo, a referencia abre com o titulo e o cabecalho em branco.
  if (!ranking || ranking.itens.length === 0) {
    return (
      <div className="border-t border-slate-800 p-4">
        <div className="overflow-x-auto">
          <GraficoDePareto id={ID_DO_GRAFICO} titulo="Ranking das Não Conformidades" subtitulos={subtitulos} itens={[]} />
        </div>
        <p className="pb-6 text-center text-sm text-brand-muted">
          {ranking
            ? "Nenhuma não conformidade no período. Ajuste as datas ou os filtros acima."
            : "Escolha a Data Inicial e a Data Final acima e clique em Filtrar."}
        </p>
      </div>
    );
  }

  const { colunas, linhas } = paraPlanilha(ranking);

  return (
    <div className="relative border-t border-slate-800 p-4">
      <div className="absolute right-4 top-4 z-10">
        <MenuDoGrafico
          idDoGrafico={ID_DO_GRAFICO}
          nomeDoArquivo="ranking-das-nao-conformidades"
          colunas={colunas}
          linhas={linhas}
        />
      </div>
      <div
        role="region"
        aria-label="Gráfico de Pareto das não conformidades por tipo de evento"
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        <GraficoDePareto
          id={ID_DO_GRAFICO}
          titulo="Ranking das Não Conformidades"
          subtitulos={subtitulos}
          itens={ranking.itens.map((item) => ({
            rotulo: item.eventoNome,
            quantidade: item.quantidade,
            percentual: item.percentual,
          }))}
        />
      </div>
    </div>
  );
}
