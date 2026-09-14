import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmLinhaEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PencilIcon,
  PlusCircleIcon,
  QrCodeIcon,
} from "@/components/dashboard/icons";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import {
  extrairFiltros,
  getOpcoes,
  getQrCodes,
  primeiro,
  toTableRow,
  COLUNAS_EXPORTACAO,
  PAGE_SIZE,
  SITUACOES,
  type SearchParams,
} from "./queries";

// A ultima coluna so existe na tela: a exportacao nao a tem.
const TABLE_COLUMNS = [...COLUNAS_EXPORTACAO, "Ações"];
const MIN_WIDTH = "min-w-[800px]";
const GRADE_DE_FILTROS = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4";

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function QrCodePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Cadastros" }, { label: "QR-Code" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCodeIcon className="h-4 w-4" />
            QR-Code
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={4} />}>
            <AcoesDoCabecalho searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmLinhaEsqueleto campos={4} gradeInterna={GRADE_DE_FILTROS} />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={TABLE_COLUMNS.length} minWidth={MIN_WIDTH} />}>
          <TabelaDeQrCodes searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Mesmos filtros da listagem, sem a paginacao -- getQrCodesParaExportar
 * ignora pagina de proposito (ver queries.ts).
 */
function montarQueryDeExportacao(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (chave === "pagina") continue;
    const v = primeiro(valor);
    if (v) query.set(chave, v);
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function AcoesDoCabecalho({ searchParams }: { searchParams: SearchParamsPromise }) {
  const queryExportacao = montarQueryDeExportacao(await searchParams);
  const podeAdministrar = await podeAdministrarCadastros();

  return (
    <div className="flex items-center gap-2">
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/cadastros/qr-code/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/cadastros/qr-code/export/pdf${queryExportacao}`}
        className="bg-red-600/40"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Imprimir Etiquetas"
        href={`/dashboard/cadastros/qr-code/export/etiquetas${queryExportacao}`}
        className="bg-sky-600/40"
        target="_blank"
      >
        <QrCodeIcon className="h-4 w-4" />
      </Acao>
      {podeAdministrar ? (
        <Acao
          titulo="Novo QR-Code"
          href="/dashboard/cadastros/qr-code/novo"
          className="bg-amber-500/80"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </Acao>
      ) : (
        <AcaoDesabilitada
          titulo="Novo QR-Code"
          motivo="você não tem permissão"
          className="bg-amber-500/40"
        >
          <PlusCircleIcon className="h-4 w-4" />
        </AcaoDesabilitada>
      )}
    </div>
  );
}

/** Mesmo mecanismo das demais telas: form GET, filtros na querystring, sem JS
 * no cliente. */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoes();

  return (
    <form
      method="get"
      className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-end"
    >
      <div className={`min-w-0 flex-1 ${GRADE_DE_FILTROS}`}>
        <FilterInput label="Código ou finalidade..." name="busca" defaultValue={filtros.busca} />
        <FilterSelect
          label="Tipos de Serviço"
          name="tipo_servico"
          defaultValue={filtros.tipoServico}
          options={opcoes.tiposServico}
        />
        <FilterSelect
          label="Grupo de Sites"
          name="grupo_site"
          defaultValue={filtros.grupoSite}
          options={opcoes.gruposSites}
        />
        {/* Sem placeholder vazio: "Todos" ja e a opcao de nao filtrar, e o
            padrao e "Ativos" -- ver SITUACAO_PADRAO em queries.ts. */}
        <FilterSelect
          label="Situação"
          name="situacao"
          defaultValue={filtros.situacao}
          options={SITUACOES}
          semOpcaoVazia
        />
      </div>

      <Button type="submit" className="group shrink-0 xl:w-52">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDeQrCodes({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);

  const [resultado, podeAdministrar] = await Promise.all([
    getQrCodes(filtros),
    podeAdministrarCadastros(),
  ]);

  const totalPages = Math.max(1, Math.ceil(resultado.totalItems / PAGE_SIZE));

  // Quem nao administra continua vendo o botao, desabilitado: escondê-lo faria
  // a coluna "Ações" aparecer vazia, sem explicar por que.
  const rows = resultado.rows.map((qrCode) => [
    ...toTableRow(qrCode),
    podeAdministrar ? (
      <Acao
        key={qrCode.id}
        titulo={`Editar ${qrCode.codigo}`}
        href={`/dashboard/cadastros/qr-code/${qrCode.id}/editar`}
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </Acao>
    ) : (
      <AcaoDesabilitada
        key={qrCode.id}
        titulo="Editar QR-Code"
        motivo="você não tem permissão"
        className="bg-white/10"
      >
        <PencilIcon className="h-4 w-4" />
      </AcaoDesabilitada>
    ),
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

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      rows={rows}
      page={filtros.pagina}
      totalPages={totalPages}
      totalItems={resultado.totalItems}
      buildPageHref={buildPageHref}
      minWidth={MIN_WIDTH}
      emptyTitle="Nenhum QR-Code encontrado"
      emptyDescription="Ajuste os filtros acima para localizar cadastros."
    />
  );
}
