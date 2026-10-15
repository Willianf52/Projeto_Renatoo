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
  getGraficosPorClassificacao,
  getOpcoesFiltros,
  seriesPorClassificacao,
  seriesPorUsuario,
  type SearchParams,
} from "./queries";

const ID_POR_CLASSIFICACAO = "grafico-por-classificacao";
const ID_POR_USUARIO = "grafico-por-classificacao-usuarios";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function GraficosPorClassificacaoPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Gráficos por Classificação" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        {/* "Gráfico de Classificação por Eventos" no cartao: e o titulo da
            referencia, diferente do nome no menu. */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Gráfico de Classificação por Eventos
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={7} colunas="xl:grid-cols-3" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDosGraficos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Sites, Eventos e Usuarios na primeira linha; datas, Status e Filtrar na
 * segunda, como na referencia. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="space-y-3 border-b border-slate-800 p-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
        <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        </div>
        <div className="w-full lg:w-44">
          <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        </div>
        <div className="w-full lg:w-44">
          <FilterSelect label="Status" name="status" defaultValue={filtros.status} options={opcoes.status} />
        </div>
        <Button type="submit" className="group w-full lg:w-40">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
      </div>
    </form>
  );
}

async function CorpoDosGraficos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const resultado = await getGraficosPorClassificacao(filtros);
  const periodo = `${filtros.dataInicial ? formatarData(filtros.dataInicial) : ""} até ${
    filtros.dataFinal ? formatarData(filtros.dataFinal) : ""
  }`;

  if (!resultado || resultado.total === 0) {
    return (
      <div className="px-4 py-16 text-center animate-fade-in-up">
        <p className="text-sm font-medium text-white">
          {resultado ? "Nenhum evento classificado no período" : "Selecione um período"}
        </p>
        <p className="mt-1 text-sm text-brand-muted">
          {resultado
            ? "Só entram ocorrências que já receberam uma classificação na análise do Painel de Eventos."
            : "Escolha a Data Inicial e a Data Final acima e clique em Filtrar."}
        </p>
      </div>
    );
  }

  const linhasPorClassificacao = resultado.classificacoes.map((c) => [c.nome, String(c.quantidade)]);
  const linhasPorUsuario = resultado.usuarios.map((u) => [u.nome, String(u.total)]);

  return (
    <div className="divide-y divide-slate-800">
      <Bloco
        id={ID_POR_CLASSIFICACAO}
        rotulo="Gráfico de eventos por classificação"
        arquivo="graficos-por-classificacao"
        colunas={["Visão Geral", "Total"]}
        linhas={linhasPorClassificacao}
      >
        <GraficoDeColunasEmpilhadas
          id={ID_POR_CLASSIFICACAO}
          titulo="Eventos"
          subtitulos={[periodo]}
          categorias={resultado.classificacoes.map((c) => ({ rotulo: c.nome, dica: c.nome }))}
          series={seriesPorClassificacao(resultado)}
          tituloEixoY="Quantidade"
        />
      </Bloco>

      <Bloco
        id={ID_POR_USUARIO}
        rotulo="Gráfico de eventos por usuário e classificação"
        arquivo="graficos-por-classificacao-usuarios"
        colunas={["Usuário", "Total"]}
        linhas={linhasPorUsuario}
      >
        <GraficoDeColunasEmpilhadas
          id={ID_POR_USUARIO}
          titulo="Eventos por Usuários"
          subtitulos={[periodo]}
          categorias={resultado.usuarios.map((u) => ({ rotulo: u.nome, dica: u.nome }))}
          series={seriesPorUsuario(resultado)}
          tituloEixoY="Quantidade"
        />
      </Bloco>
    </div>
  );
}

/** Grafico + menu de exportar + a tabela de totais que a referencia poe embaixo
 * de cada grafico. */
function Bloco({
  id,
  rotulo,
  arquivo,
  colunas,
  linhas,
  children,
}: {
  id: string;
  rotulo: string;
  arquivo: string;
  colunas: string[];
  linhas: string[][];
  children: React.ReactNode;
}) {
  return (
    <div className="relative space-y-3 p-4">
      <div className="absolute right-4 top-4 z-10">
        <MenuDoGrafico idDoGrafico={id} nomeDoArquivo={arquivo} colunas={colunas} linhas={linhas} />
      </div>
      <div
        role="region"
        aria-label={rotulo}
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        {children}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-brand-muted">
            <th className="px-3 py-2 font-medium">{colunas[0]}</th>
            <th className="w-32 px-3 py-2 text-center font-medium">{colunas[1]}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([nome, total]) => (
            <tr key={nome} className="border-b border-slate-800/60 text-slate-200">
              <td className="px-3 py-2">{nome}</td>
              <td className="px-3 py-2 text-center">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
