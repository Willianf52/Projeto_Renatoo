import { Suspense } from "react";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { AcoesEsqueleto, FiltrosEmLinhaEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { EyeIcon, FilterIcon, PencilIcon, PlusCircleIcon, SlidersIcon } from "@/components/dashboard/icons";
import { descricaoDeListaVazia, temFiltroAplicado } from "@/lib/lista-vazia";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { getMaquinas, getSitesParaSelecao, nomesDosSites, PAGE_SIZE, type MaquinaFiltros } from "./queries";

/**
 * Cadastros > Maquinas (pedido do gestor, 0111): maquinas de cada site, com o
 * historico de manutencao na pagina da maquina. Mesmo molde de Veiculos.
 */

const LISTAGEM = "/dashboard/cadastros/maquinas";
const COLUNAS = ["Site", "Modelo", "Ativo (patrimônio)", "Status", "Ações"];
const MIN_WIDTH = "min-w-[800px]";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): MaquinaFiltros {
  return {
    busca: primeiro(params.busca),
    site: primeiro(params.site),
    status: primeiro(params.status),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

const STATUS_OPCOES = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

export default function MaquinasPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Máquina salva com sucesso." />
      </Suspense>
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Máquinas" }]} />
      </div>
      <div className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersIcon className="h-4 w-4" />
            Máquinas
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <AcoesDoCabecalho />
          </Suspense>
        </div>
        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <Tabela searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function AcoesDoCabecalho() {
  return (await podeAdministrarCadastros()) ? (
    <Acao titulo="Nova máquina" href={`${LISTAGEM}/novo`} tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </Acao>
  ) : (
    <AcaoDesabilitada titulo="Nova máquina" motivo="você não tem permissão" tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const [filtros, sites] = await Promise.all([searchParams.then(extrairFiltros), getSitesParaSelecao()]);
  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className="min-w-0 flex-1">
        <FilterInput label="Busca Livre (modelo, patrimônio)..." name="busca" defaultValue={filtros.busca} />
      </div>
      <div className="w-full xl:w-64">
        <FilterSelect label="Site" name="site" placeholder="Site: todos" defaultValue={filtros.site} options={sites} />
      </div>
      <div className="w-full xl:w-52">
        <FilterSelect label="Status" name="status" placeholder="Status: todos" defaultValue={filtros.status} options={STATUS_OPCOES} />
      </div>
      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function Tabela({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const [resultado, podeAdministrar] = await Promise.all([getMaquinas(filtros), podeAdministrarCadastros()]);
  const sites = await nomesDosSites(resultado.rows.map((m) => m.site_id));
  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  const rows = resultado.rows.map((m) => [
    sites.get(m.site_id) ?? "",
    m.modelo,
    m.patrimonio,
    m.ativo ? "Ativo" : "Inativo",
    <div key="acoes" className="flex items-center gap-2">
      <Acao titulo={`Manutenções de ${m.modelo}`} href={`${LISTAGEM}/${m.id}`} tom="neutro">
        <EyeIcon className="h-4 w-4" />
      </Acao>
      {podeAdministrar ? (
        <Acao titulo={`Editar ${m.modelo}`} href={`${LISTAGEM}/${m.id}/editar`} tom="neutro">
          <PencilIcon className="h-4 w-4" />
        </Acao>
      ) : (
        <AcaoDesabilitada titulo="Editar máquina" motivo="você não tem permissão" tom="neutro">
          <PencilIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>,
  ]);

  const buildPageHref = (pagina: number) => {
    const query = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      const v = primeiro(valor);
      if (v) query.set(chave, v);
    }
    query.set("pagina", String(pagina));
    return `?${query.toString()}`;
  };
  const filtrado = temFiltroAplicado(params);

  return (
    <DataTable
      columns={COLUNAS}
      rows={rows}
      page={filtros.pagina}
      totalPages={totalPages}
      totalItems={resultado.totalItems}
      buildPageHref={buildPageHref}
      minWidth={MIN_WIDTH}
      emptyTitle={filtrado ? "Nenhuma máquina encontrada" : "Nenhuma máquina cadastrada"}
      emptyDescription={descricaoDeListaVazia({
        filtrado,
        podeCadastrar: podeAdministrar,
        descricaoFiltrada: "Ajuste os filtros acima para localizar máquinas.",
      })}
    />
  );
}
