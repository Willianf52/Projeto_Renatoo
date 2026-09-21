import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import {
  AcoesEsqueleto,
  CorpoDeRelatorioEsqueleto,
  FiltrosEmGradeEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { BarChartIcon, ExcelIcon, FilterIcon, PdfIcon, SearchIcon } from "@/components/dashboard/icons";
import { formatarDiaCurto } from "@/lib/data-hora";
import { ArvoreDoMapa } from "./ArvoreDoMapa";
import {
  extrairFiltros,
  getMapaDeEventosPorSite,
  getOpcoesFiltros,
  LIMITE_DIAS,
  primeiro,
  type SearchParams,
} from "./queries";

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
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
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
        href={`/dashboard/eventos/relatorios/mapa-de-eventos-por-site/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/eventos/relatorios/mapa-de-eventos-por-site/export/pdf${queryExportacao}`}
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
 * Sem periodo, o convite a escolher as datas -- a referencia nao mostra nada
 * abaixo dos filtros antes de filtrar. Com periodo, a arvore.
 */
async function CorpoDoMapa({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const mapa = await getMapaDeEventosPorSite(filtros);

  if (!mapa || mapa.dias.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 border-t border-slate-800 px-4 py-16 text-center animate-fade-in-up">
        <div className="rounded-full bg-brand-navy p-3 text-brand-muted">
          <SearchIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-white">Selecione um período</p>
        <p className="text-sm text-brand-muted">
          {mapa
            ? "A Data Final está antes da Data Inicial. Ajuste o período e clique em Filtrar."
            : "Escolha a Data Inicial e a Data Final acima e clique em Filtrar para ver o mapa de eventos por site."}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 p-4">
      {mapa.diasExcedidos && (
        <p className="mb-3 text-xs text-amber-300">
          O período passa de {LIMITE_DIAS} dias; o mapa mostra só os {LIMITE_DIAS} primeiros.
        </p>
      )}
      {/* Cor como na referencia: verde sem ocorrencia, vermelho com. O
          amarelo da referencia depende da situacao de tratativa (Status),
          que o schema ainda nao guarda -- sem ela, toda ocorrencia conta como
          nao tratada. */}
      <div
        role="region"
        aria-label="Mapa de eventos por site"
        tabIndex={0}
        className="overflow-x-auto rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        <ArvoreDoMapa colunas={mapa.dias.map(formatarDiaCurto)} raiz={mapa.raiz} />
      </div>
    </div>
  );
}
