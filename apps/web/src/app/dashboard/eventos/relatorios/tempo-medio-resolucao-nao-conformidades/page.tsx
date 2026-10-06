import { Suspense } from "react";
import { BarChart } from "@/components/dashboard/BarChart";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { CorpoDeRelatorioEsqueleto, FiltrosEmGradeEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { BarChartIcon, FilterIcon } from "@/components/dashboard/icons";
import { MenuDoGrafico } from "@/components/dashboard/MenuDoGrafico";
import {
  OPCOES_DE_FORMATO,
  OPCOES_DE_STATUS,
  extrairFiltros,
  formatarData,
  formatarDuracao,
  formatarMedia,
  getOpcoesFiltros,
  getTempoMedio,
  paraPlanilha,
  type SearchParams,
} from "./queries";

const ID_DO_GRAFICO = "tempo-medio-de-resolucao";

type SearchParamsPromise = Promise<SearchParams>;

/**
 * Tempo Medio de Resolucao das Nao Conformidades (item 5 da #164, segunda
 * metade). A regra e a consulta estao em `queries.ts`.
 *
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components).
 */
export default function TempoMedioResolucaoNaoConformidadesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs
          items={[
            { label: "Eventos" },
            { label: "Relatórios" },
            { label: "Tempo Médio de Resolução das Não Conformidades" },
          ]}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Tempo Médio de Resolução das Não Conformidades
          </h1>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={12} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<CorpoDeRelatorioEsqueleto />}>
          <CorpoDoTempoMedio searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** GET nativo, na mesma ordem de campos da referencia (Dias/Horas no fim). */
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
        <FilterSelect label="Status" name="status" defaultValue={filtros.status} options={OPCOES_DE_STATUS} />
      </div>

      <div className="xl:col-span-5 xl:col-start-1">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      </div>
      <div className="xl:col-span-5">
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>

      <div className="xl:col-span-2 xl:col-start-1">
        {/* Ocorrencia nasce de uma resposta de checklist, nao de uma
            atividade nem de um modelo escolhido aqui: os dois campos ficam
            visiveis, como na referencia, mas sem opcao. */}
        <FilterSelect label="Checklists" name="checklist" options={[]} />
      </div>
      <div className="xl:col-span-2">
        <FilterSelect label="Atividades" name="atividade" options={[]} />
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
      <div className="xl:col-span-2">
        <FilterSelect
          label="Unidade"
          name="formato"
          defaultValue={filtros.formato}
          options={OPCOES_DE_FORMATO}
        />
      </div>

      <Button type="submit" className="group w-full sm:col-span-2 xl:col-span-12">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function CorpoDoTempoMedio({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const itens = await getTempoMedio(filtros);

  const unidade = filtros.formato === "horas" ? "Horas" : "Dias";
  const periodo = `${filtros.dataInicial ? formatarData(filtros.dataInicial) : ""} até ${
    filtros.dataFinal ? formatarData(filtros.dataFinal) : ""
  }`;

  const cabecalho = (
    <div className="pb-2 text-center">
      <h2 className="text-base font-semibold text-white">Tempo Médio de Resolução das Não Conformidades</h2>
      <p className="text-xs text-brand-muted">{periodo}</p>
    </div>
  );

  // Sem periodo, ou sem ocorrencia finalizada: a referencia abre com o titulo,
  // o eixo e a tabela vazios.
  if (!itens || itens.length === 0) {
    return (
      <div className="border-t border-slate-800 p-4">
        {cabecalho}
        <p className="py-10 text-center text-sm text-brand-muted">
          {itens
            ? "Nenhuma ocorrência finalizada no período. O tempo de resolução conta só ocorrências já finalizadas."
            : "Escolha a Data Inicial e a Data Final acima e clique em Filtrar."}
        </p>
      </div>
    );
  }

  const { colunas, linhas } = paraPlanilha(itens, filtros.formato);

  return (
    <div className="relative border-t border-slate-800 p-4">
      <div className="absolute right-4 top-4 z-10">
        <MenuDoGrafico
          idDoGrafico={ID_DO_GRAFICO}
          nomeDoArquivo="tempo-medio-de-resolucao"
          colunas={colunas}
          linhas={linhas}
        />
      </div>
      {cabecalho}
      <div
        role="region"
        aria-label={`Gráfico do tempo médio de resolução por tipo de evento, em ${unidade.toLowerCase()}`}
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        <BarChart
          id={ID_DO_GRAFICO}
          itens={itens.map((item) => ({ nome: item.eventoNome, valor: item.media }))}
          tituloEixoY={`Tempo Médio (${unidade})`}
          rotulo={`Tempo médio de resolução por tipo de evento, em ${unidade.toLowerCase()}`}
          formatarValor={formatarMedia}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase text-brand-muted">
            <tr>
              <th className="px-3 py-2">Evento</th>
              <th className="px-3 py-2 text-right">Qtd {unidade}</th>
              <th className="px-3 py-2 text-right">Tempo Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.eventoId} className="border-b border-slate-800/60">
                <td className="px-3 py-2 text-white">{item.eventoNome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMedia(item.media)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarDuracao(item.totalMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
