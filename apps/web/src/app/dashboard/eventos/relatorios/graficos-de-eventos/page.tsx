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
import { GraficoDePizza } from "@/components/dashboard/GraficoDePizza";
import { FilterIcon, PieChartIcon } from "@/components/dashboard/icons";
import { MenuDoGrafico } from "@/components/dashboard/MenuDoGrafico";
import {
  extrairFiltros,
  fatiasDaPizza,
  formatarData,
  getGraficosDeEventos,
  getOpcoesFiltros,
  montarSeries,
  paraPlanilha,
  type SearchParams,
} from "./queries";

const ID_DA_PIZZA = "grafico-de-eventos-pizza";
const ID_DAS_COLUNAS = "grafico-de-eventos-colunas";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function GraficosDeEventosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Gráficos de Eventos" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        {/* "Relatório de Eventos" no cartao e "Gráficos de Eventos" no menu e
            na trilha: e assim na referencia, nao e engano. */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PieChartIcon className="h-4 w-4" />
            Relatório de Eventos
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={11} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        {/* Os dois graficos numa fronteira so: saem da MESMA consulta, entao
            separa-los faria o segundo esperar por nada. */}
        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDosGraficos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * GET nativo, como as demais telas. Mesma grade de 12 colunas do Eventos por
 * Site -- a referencia desenha as duas telas com a mesma faixa de filtros.
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
 * Os dois graficos da referencia, um embaixo do outro: a pizza com a fatia de
 * cada evento no periodo, e as colunas empilhadas por status com uma coluna
 * por evento. Saem da mesma agregacao -- na referencia os numeros batem (as
 * colunas somavam 59, que e o "Total de Eventos", e RH com 24 dava os 40,7%
 * da fatia).
 *
 * Titulo, periodo e total vao DENTRO de cada SVG, para a imagem baixada pelo
 * menu sair completa.
 */
async function CorpoDosGraficos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const resultado = await getGraficosDeEventos(filtros);
  const periodo = `${filtros.dataInicial ? formatarData(filtros.dataInicial) : ""} até ${
    filtros.dataFinal ? formatarData(filtros.dataFinal) : ""
  }`;
  const totalNoRodape = `Total de Eventos: ${resultado ? resultado.total : ""}`;

  // Sem periodo, a referencia abre so com o circulo vazio e o cabecalho em
  // branco -- e o que `GraficoDePizza` desenha quando nao ha fatia.
  if (!resultado || resultado.eventos.length === 0) {
    return (
      <div className="border-t border-slate-800 p-4">
        <div className="overflow-x-auto">
          <GraficoDePizza id={ID_DA_PIZZA} titulo="Eventos" subtitulos={[periodo, totalNoRodape]} fatias={[]} />
        </div>
        {resultado && (
          <p className="pb-6 text-center text-sm text-brand-muted">
            Nenhum evento no período. Ajuste as datas ou os filtros acima.
          </p>
        )}
      </div>
    );
  }

  const { colunas, linhas } = paraPlanilha(resultado.eventos, resultado.total);
  const subtitulos = [periodo, totalNoRodape];

  return (
    <div className="divide-y divide-slate-800 border-t border-slate-800">
      <div className="relative p-4">
        <div className="absolute right-4 top-4 z-10">
          <MenuDoGrafico
            idDoGrafico={ID_DA_PIZZA}
            nomeDoArquivo="graficos-de-eventos-pizza"
            colunas={colunas}
            linhas={linhas}
          />
        </div>
        <div
          role="region"
          aria-label="Gráfico de eventos por participação no total"
          tabIndex={0}
          className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
        >
          <GraficoDePizza
            id={ID_DA_PIZZA}
            titulo="Eventos"
            subtitulos={subtitulos}
            fatias={fatiasDaPizza(resultado.eventos)}
          />
        </div>
      </div>

      <div className="relative p-4">
        <div className="absolute right-4 top-4 z-10">
          <MenuDoGrafico
            idDoGrafico={ID_DAS_COLUNAS}
            nomeDoArquivo="graficos-de-eventos-colunas"
            colunas={colunas}
            linhas={linhas}
          />
        </div>
        <div
          role="region"
          aria-label="Gráfico de quantidade de eventos por status"
          tabIndex={0}
          className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
        >
          <GraficoDeColunasEmpilhadas
            id={ID_DAS_COLUNAS}
            titulo="Eventos"
            subtitulos={subtitulos}
            categorias={resultado.eventos.map((evento) => ({
              rotulo: evento.eventoNome,
              dica: evento.eventoNome,
            }))}
            series={montarSeries(resultado.eventos)}
            tituloEixoY="Quantidade"
          />
        </div>
      </div>
    </div>
  );
}
