import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import {
  AcoesEsqueleto,
  FiltrosEmGradeEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterMonthPicker } from "@/components/dashboard/FilterMonthPicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { GraficoPorDia } from "@/components/dashboard/GraficoPorDia";
import { BarChartIcon, ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";
import {
  DIAS_DO_MES,
  extrairFiltros,
  getMapaDeEventos,
  getOpcoesFiltros,
  primeiro,
  TIPOS_DE_GRAFICO,
  type SearchParams,
} from "./queries";

const DIAS = Array.from({ length: DIAS_DO_MES }, (_, i) => i + 1);
const MIN_WIDTH = "min-w-[1200px]";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function MapaDeEventosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Relatórios" }, { label: "Mapa de Eventos" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChartIcon className="h-4 w-4" />
            Mapa de Eventos
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={11} colunas="xl:grid-cols-5" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={12} linhas={4} minWidth={MIN_WIDTH} />}>
          <CorpoDoMapa searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mesmos filtros da tela; o tipo de grafico nao muda o que se exporta, mas
 * ir junto e inofensivo e mantem a funcao igual a das outras telas. */
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
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/eventos/relatorios/mapa-de-eventos/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/eventos/relatorios/mapa-de-eventos/export/pdf${queryExportacao}`}
        className="bg-red-600/40"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

/**
 * GET nativo, como as demais telas. Grade de 12 colunas no desktop para
 * reproduzir as tres linhas da referencia: os campos da segunda linha (Sites,
 * Usuários) alinham com os da primeira, e o Filtrar fecha a terceira a
 * direita. Abaixo de `xl` vira grade simples de duas colunas.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-12">
      <div className="xl:col-span-2">
        <FilterMonthPicker label="Mês/Ano" name="mes" defaultValue={filtros.mes} />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect label="Eventos" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
      </div>
      <div className="xl:col-span-3">
        <FilterSelect
          label="Tipo de Gráfico"
          name="tipo_grafico"
          defaultValue={filtros.tipoDeGrafico}
          options={TIPOS_DE_GRAFICO}
        />
      </div>
      <div className="xl:col-span-2">
        {/* Sem situacao de tratativa no schema (Aguardando, Em Análise,
            Atendido...): nenhuma tabela guarda em que pe esta a ocorrencia.
            Visivel como na referencia, sem opcao -- mesma decisao do Registro
            de Eventos. Ligar isto exige migration nova. */}
        <FilterSelect label="Status" name="status" options={[]} />
      </div>

      <div className="xl:col-span-5 xl:col-start-1">
        <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      </div>
      <div className="xl:col-span-5">
        <FilterSelect label="Usuários" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      </div>

      <div className="xl:col-span-2 xl:col-start-1">
        {/* Sem tabela de checklists ligada a eventos -- mesma decisao do
            "Checklists" em Registro das Rondas. */}
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
      <Button type="submit" className="group w-full xl:col-span-2">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

/** Dia sem ocorrencia fica em branco, como na referencia: numa grade de 31
 * colunas o zero repetido esconde os dias que tiveram algo. */
function valorDaCelula(n: number) {
  return n > 0 ? n : "";
}

async function CorpoDoMapa({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const mapa = await getMapaDeEventos(filtros);

  return (
    <>
      <div role="region" aria-label="Mapa de eventos por dia" tabIndex={0} className="overflow-x-auto p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-green">
        <table className={`w-full ${MIN_WIDTH} border-collapse text-left text-xs`}>
          <thead>
            <tr className="border-b border-slate-800 text-brand-muted">
              <th scope="col" className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-semibold whitespace-nowrap">
                Eventos
              </th>
              {DIAS.map((dia) => (
                <th key={dia} scope="col" className="px-1.5 py-2 text-center font-semibold">
                  {dia}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center font-semibold">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {mapa.linhas.length === 0 ? (
              <tr>
                <td colSpan={DIAS_DO_MES + 2} className="px-3 py-6 text-center text-brand-muted">
                  Nenhum evento registrado neste mês. Ajuste o Mês/Ano ou os filtros acima.
                </td>
              </tr>
            ) : (
              mapa.linhas.map((linha, indice) => (
                <tr
                  key={linha.eventoId}
                  className="border-b border-slate-800/60 animate-fade-in-up hover:bg-white/5"
                  style={{ animationDelay: `${Math.min(indice, 12) * 30}ms` }}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-brand-surface px-3 py-2 font-medium whitespace-nowrap text-white"
                  >
                    {linha.eventoNome}
                  </th>
                  {linha.porDia.map((n, dia) => (
                    <td key={dia} className="px-1.5 py-2 text-center text-white">
                      {valorDaCelula(n)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold text-white">{linha.total}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-brand-navy/40 font-semibold text-white">
              <th scope="row" className="sticky left-0 z-10 bg-brand-navy px-3 py-2">
                Total
              </th>
              {mapa.totaisPorDia.map((n, dia) => (
                <td key={dia} className="px-1.5 py-2 text-center">
                  {valorDaCelula(n)}
                </td>
              ))}
              <td className="px-3 py-2 text-center">{valorDaCelula(mapa.totalGeral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* O grafico so aparece quando alguem escolhe o tipo -- sem escolha, a
          referencia mostra so a grade. Plota a linha Total (ocorrencias por
          dia), que e o resumo que cabe num grafico de uma serie. */}
      {filtros.tipoDeGrafico && mapa.linhas.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-800 p-4">
          <GraficoPorDia
            valores={mapa.totaisPorDia}
            tipo={filtros.tipoDeGrafico}
            rotulo="Total de eventos por dia do mês"
          />
        </div>
      )}
    </>
  );
}
