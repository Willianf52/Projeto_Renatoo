import { Suspense } from "react";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FiltrosEmGradeEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { Acao } from "@/components/dashboard/Acao";
import { BarChartIcon, ExcelIcon, FilterIcon } from "@/components/dashboard/icons";
import { NIVEIS_ACESSO } from "../usuarios/constantes";
import {
  COLUNAS_PESSOAS,
  COLUNAS_TELAS,
  extrairFiltros,
  getUsoDoPortal,
  linhaDaPessoa,
  linhaDaTela,
  periodoValido,
  primeiro,
  resumo,
  type SearchParams,
} from "./queries";

type SearchParamsPromise = Promise<SearchParams>;


/** Pagina sem `async` -- ver `inspecoes/coletas-importadas/page.tsx` (Cache Components). */
export default function UsoDoPortalPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Uso do Portal" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
              <BarChartIcon className="h-4 w-4" />
              Uso do Portal
            </h1>
            <Suspense fallback={null}>
              <Exportar searchParams={searchParams} />
            </Suspense>
          </div>
          <p className="mt-1 text-xs text-brand-muted">
            Entradas e telas abertas no portal, sem cookie e sem serviço de fora. O app de campo não entra aqui: o
            trabalho dele aparece nas inspeções.
          </p>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={4} colunas="xl:grid-cols-4" />}>
          <Filtros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS_PESSOAS.length} />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mesmos filtros da tela no endereco do arquivo. */
async function Exportar({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const chave of ["data_inicial", "data_final", "cargo"]) {
    const valor = primeiro(params[chave]);
    if (valor) query.set(chave, valor);
  }
  const texto = query.toString();
  return (
    <Acao
      titulo="Exportar para Excel"
      href={`/dashboard/cadastros/uso-do-portal/export/excel${texto ? `?${texto}` : ""}`}
      tom="excel"
      target="_blank"
    >
      <ExcelIcon className="h-4 w-4" />
    </Acao>
  );
}

async function Filtros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  return (
    <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
      <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
      <FilterSelect label="Cargo" name="cargo" defaultValue={filtros.cargo} options={NIVEIS_ACESSO} />
      <Button type="submit" className="group">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-md border border-slate-800 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-brand-muted">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{valor.toLocaleString("pt-BR")}</p>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: SearchParamsPromise }) {
  // Portao: `layout.tsx` (SomenteQuemAcompanhaOUso, 0118) e o RLS de `eventos_de_uso`.
  const filtros = extrairFiltros(await searchParams);
  if (!periodoValido(filtros)) {
    return (
      <p role="alert" className="m-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Escolha um período de até 366 dias, com a data final depois da inicial.
      </p>
    );
  }

  const uso = await getUsoDoPortal(filtros);
  const totais = resumo(uso);

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Numero rotulo="Pessoas que entraram" valor={totais.pessoas} />
        <Numero rotulo="Logins" valor={totais.logins} />
        <Numero rotulo="Telas abertas" valor={totais.telas} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">Por pessoa</h2>
        <DataTable
          columns={COLUNAS_PESSOAS}
          rows={uso.pessoas.map(linhaDaPessoa)}
          page={1}
          totalPages={uso.pessoas.length > 0 ? 1 : 0}
          totalItems={uso.pessoas.length}
          emptyTitle="Ninguém entrou no portal neste período"
          emptyDescription="Ajuste as datas ou o cargo acima."
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white">Telas mais abertas</h2>
        <DataTable
          columns={COLUNAS_TELAS}
          rows={uso.telas.map(linhaDaTela)}
          page={1}
          totalPages={uso.telas.length > 0 ? 1 : 0}
          totalItems={uso.telas.length}
          emptyTitle="Nenhuma tela aberta neste período"
          emptyDescription="Ajuste as datas ou o cargo acima."
        />
      </section>
    </div>
  );
}
