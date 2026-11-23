import { Suspense } from "react";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { AcoesEsqueleto, FiltrosEmLinhaEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { CarIcon, EyeIcon, FilterIcon, PencilIcon, PlusCircleIcon } from "@/components/dashboard/icons";
import { descricaoDeListaVazia, temFiltroAplicado } from "@/lib/lista-vazia";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { getVeiculos, PAGE_SIZE, type VeiculoFiltros } from "./queries";
import { formatarKm, placaNaTela, situacaoDaRevisao } from "./regras";

/**
 * Cadastros > Veiculos (pedido do gestor, 0104). Lista com a situacao da
 * revisao de cada veiculo; a pagina do veiculo tem o historico de km e de
 * manutencao. Mesmo molde das outras listagens (ver `grupo-de-sites/page.tsx`):
 * pagina sem `await` no corpo, pedacos em Suspense, filtro por GET.
 */

const LISTAGEM = "/dashboard/cadastros/veiculos";
const COLUNAS = ["Placa", "Modelo", "Cor", "Empresa", "Km atual", "Revisão", "Status", "Ações"];
const MIN_WIDTH = "min-w-[1000px]";

type SearchParams = Record<string, string | string[] | undefined>;
type SearchParamsPromise = Promise<SearchParams>;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

function extrairFiltros(params: SearchParams): VeiculoFiltros {
  return {
    busca: primeiro(params.busca),
    status: primeiro(params.status),
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

const STATUS_OPCOES = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

const COR_DO_TOM = {
  "em-dia": "text-brand-green",
  perto: "text-amber-400",
  vencida: "text-red-400",
} as const;

export default function VeiculosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Veículo salvo com sucesso." />
      </Suspense>

      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "Veículos" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CarIcon className="h-4 w-4" />
            Veículos
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={1} />}>
            <AcoesDoCabecalho />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeVeiculos searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function AcoesDoCabecalho() {
  const podeAdministrar = await podeAdministrarCadastros();
  return podeAdministrar ? (
    <Acao titulo="Novo veículo" href={`${LISTAGEM}/novo`} tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </Acao>
  ) : (
    <AcaoDesabilitada titulo="Novo veículo" motivo="você não tem permissão" tom="novo">
      <PlusCircleIcon className="h-4 w-4" />
    </AcaoDesabilitada>
  );
}

async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  return (
    <form method="get" className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end">
      <div className="min-w-0 flex-1">
        <FilterInput label="Busca Livre (placa, modelo, empresa)..." name="busca" defaultValue={filtros.busca} />
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

async function TabelaDeVeiculos({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const [resultado, podeAdministrar] = await Promise.all([getVeiculos(filtros), podeAdministrarCadastros()]);
  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  const rows = resultado.rows.map((v) => {
    const situacao = situacaoDaRevisao(v.km_atual, v.km_ultima_revisao);
    return [
      placaNaTela(v.placa),
      v.modelo,
      v.cor,
      v.empresa,
      formatarKm(v.km_atual),
      <span key="revisao" className={v.ativo ? COR_DO_TOM[situacao.tom] : "text-brand-muted"}>
        {situacao.rotulo}
      </span>,
      v.ativo ? "Ativo" : "Inativo",
      <div key="acoes" className="flex items-center gap-2">
        <Acao titulo={`Histórico de ${placaNaTela(v.placa)}`} href={`${LISTAGEM}/${v.id}`} tom="neutro">
          <EyeIcon className="h-4 w-4" />
        </Acao>
        {podeAdministrar ? (
          <Acao titulo={`Editar ${placaNaTela(v.placa)}`} href={`${LISTAGEM}/${v.id}/editar`} tom="neutro">
            <PencilIcon className="h-4 w-4" />
          </Acao>
        ) : (
          <AcaoDesabilitada titulo="Editar veículo" motivo="você não tem permissão" tom="neutro">
            <PencilIcon className="h-4 w-4" />
          </AcaoDesabilitada>
        )}
      </div>,
    ];
  });

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
      emptyTitle={filtrado ? "Nenhum veículo encontrado" : "Nenhum veículo cadastrado"}
      emptyDescription={descricaoDeListaVazia({
        filtrado,
        podeCadastrar: podeAdministrar,
        descricaoFiltrada: "Ajuste a busca acima para localizar veículos.",
      })}
    />
  );
}
