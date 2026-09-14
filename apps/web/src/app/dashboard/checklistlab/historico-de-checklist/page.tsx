import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  AcoesEsqueleto,
  FiltrosEmGradeEsqueleto,
  TabelaEsqueleto,
} from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  ClipboardListIcon,
  ExcelIcon,
  EyeIcon,
  FilterIcon,
  PdfIcon,
} from "@/components/dashboard/icons";
import {
  CAMPO_DE_DATA_OPCOES,
  CHECKLIST_OPCOES,
  CONCLUSAO_OPCOES,
  ORDEM_OPCOES,
  SITUACAO_OPCOES,
  TABLE_COLUMNS,
  TETO_DO_HISTORICO,
  extrairFiltros,
  getHistorico,
  getOpcoesFiltros,
  primeiro,
  toTableRow,
  PAGE_SIZE,
  type SearchParams,
} from "./queries";

const MIN_WIDTH = "min-w-[1480px]";

/** "Ação" nao entra em `TABLE_COLUMNS` (queries.ts) de proposito: aquela lista
 * e a das colunas de TEXTO, reaproveitada pelas exportacoes de Excel/PDF, e um
 * botao nao tem como virar celula de planilha. Mesma separacao de
 * `perguntas/page.tsx`. */
const COLUNAS_DA_TELA = [...TABLE_COLUMNS, "Ação"];

type SearchParamsPromise = Promise<SearchParams>;

/** Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components). */
export default function HistoricoDeChecklistPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Histórico de Checklist" }]} />
      </div>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Histórico de Checklist
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={2} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={16} colunas="xl:grid-cols-5" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS_DA_TELA.length} minWidth={MIN_WIDTH} />}>
          <TabelaDoHistorico searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mesmos filtros da tela, sem a paginacao -- exportar traz o resultado
 * inteiro do filtro, nao so a pagina visivel. */
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

/** Dependem so do `searchParams`, nao do banco -- por isso tem fronteira
 * propria e resolvem antes das outras duas. */
async function AcoesDeExportacao({ searchParams }: { searchParams: SearchParamsPromise }) {
  const queryExportacao = montarQueryDeExportacao(await searchParams);

  return (
    <div className="flex items-center gap-2">
      <Acao
        titulo="Exportar para Excel"
        href={`/dashboard/checklistlab/historico-de-checklist/export/excel${queryExportacao}`}
        className="bg-emerald-600/40"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF"
        href={`/dashboard/checklistlab/historico-de-checklist/export/pdf${queryExportacao}`}
        className="bg-red-600/40"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

/**
 * GET nativo, sem JS no caminho critico -- mesmo mecanismo das demais telas.
 *
 * Grade de 5 colunas a partir do xl, como na referencia: 15 campos fecham
 * exatas 3 linhas, e o Filtrar fica numa faixa cheia por baixo (e nao dentro
 * da grade) pelo mesmo motivo de `registro-de-rondas` -- com 15 campos, poe-lo
 * como 16a celula deixaria as duas ultimas linhas desalinhadas.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await searchParams);
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="space-y-3 border-b border-slate-800 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <FilterSelect
          label="Tipo de Data"
          name="campo_data"
          defaultValue={filtros.campoData}
          options={CAMPO_DE_DATA_OPCOES}
          semOpcaoVazia
        />
        <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        <FilterInput label="Número/Ano" name="numero_ano" defaultValue={filtros.numeroAno} />
        <FilterSelect
          label="Checklists"
          name="checklist"
          defaultValue={filtros.checklist}
          options={CHECKLIST_OPCOES}
        />

        <FilterSelect
          label="Ordenação"
          name="ordem"
          defaultValue={filtros.ordem}
          options={ORDEM_OPCOES}
          semOpcaoVazia
        />
        <FilterSelect label="Sites" name="site" defaultValue={filtros.site} options={opcoes.sites} />
        <FilterSelect
          label="Grupos Sites"
          name="grupo_site"
          defaultValue={filtros.grupoSite}
          options={opcoes.gruposSites}
        />
        <FilterSelect
          label="Grupos Usuários"
          name="grupo_usuario"
          defaultValue={filtros.grupoUsuario}
          options={opcoes.gruposUsuarios}
        />
        <FilterSelect
          label="Responsável"
          name="responsavel"
          defaultValue={filtros.responsavel}
          options={opcoes.responsaveis}
        />

        <FilterSelect
          label="Situação"
          name="situacao"
          defaultValue={filtros.situacao}
          options={SITUACAO_OPCOES}
        />
        <FilterSelect
          label="Conclusão"
          name="conclusao"
          defaultValue={filtros.conclusao}
          options={CONCLUSAO_OPCOES}
        />
        {/* Sem contrapartida no schema: `checklists_visita` (0042) so aceita
            INSERT -- um checklist enviado nao e cancelado nem reaberto, entao
            todas as linhas teriam o mesmo Status. O campo fica visivel (igual
            a referencia, e igual ao "Checklists" de registro-de-rondas) mas
            sem opcao nenhuma pra escolher, e `extrairFiltros` nao le `status`. */}
        <FilterSelect label="Status" name="status" options={[]} />
        <FilterInput label="Busca Livre" name="busca" defaultValue={filtros.busca} />
        <FilterInput
          label="Busca Livre Respostas tipo Texto"
          name="busca_respostas"
          defaultValue={filtros.buscaRespostas}
        />
      </div>

      <Button type="submit" className="group w-full">
        <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
        Filtrar
      </Button>
    </form>
  );
}

async function TabelaDoHistorico({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const filtros = extrairFiltros(params);
  const pagina = Math.max(1, Number(primeiro(params.pagina)) || 1);

  const historico = await getHistorico(filtros);

  // Paginacao em memoria: os filtros de Situacao/Conclusao/busca em respostas
  // sao decididos depois da consulta (ver getHistorico), entao o corte de
  // pagina precisa vir depois deles -- cortar no banco devolveria paginas de
  // tamanho variavel. Mesmo arranjo de `registro-de-rondas`.
  const totalItems = historico.linhas.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const paginaValida = Math.min(pagina, totalPages);
  const inicio = (paginaValida - 1) * PAGE_SIZE;

  // Os filtros atuais viajam junto no link do detalhe para que o "Voltar ao
  // histórico" de la reencontre a mesma pagina filtrada, e nao a listagem
  // zerada.
  const filtrosNaUrl = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v) filtrosNaUrl.set(chave, v);
  }
  const querystringAtual = filtrosNaUrl.toString();

  const rows = historico.linhas.slice(inicio, inicio + PAGE_SIZE).map((linha) => [
    ...toTableRow(linha),
    <Acao
      key={linha.id}
      titulo={`Ver checklist ${linha.id}`}
      href={`/dashboard/checklistlab/historico-de-checklist/${linha.id}${
        querystringAtual ? `?${querystringAtual}` : ""
      }`}
      className="bg-white/10"
    >
      <EyeIcon className="h-4 w-4" />
    </Acao>,
  ]);

  const buildPageHref = (novaPagina: number) => {
    const query = new URLSearchParams(querystringAtual);
    query.set("pagina", String(novaPagina));
    return `?${query.toString()}`;
  };

  return (
    <>
      {historico.truncado && (
        <p className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
          Mais de {TETO_DO_HISTORICO} checklists no filtro — a listagem abaixo está incompleta. Reduza o
          período ou use os demais filtros.
        </p>
      )}

      <DataTable
        columns={COLUNAS_DA_TELA}
        rows={rows}
        page={paginaValida}
        totalPages={totalPages}
        totalItems={totalItems}
        buildPageHref={buildPageHref}
        minWidth={MIN_WIDTH}
        emptyTitle="Nenhum checklist encontrado"
        emptyDescription="Ajuste o período ou os filtros acima para localizar checklists enviados pelo app de campo."
      />
    </>
  );
}
