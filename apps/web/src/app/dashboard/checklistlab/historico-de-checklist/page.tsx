import Link from "next/link";
import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { AvisoDeSalvo } from "@/components/dashboard/AvisoDeSalvo";
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
import { FilterMultiSelect } from "@/components/dashboard/FilterMultiSelect";
import {
  ClipboardListIcon,
  ExcelIcon,
  EyeIcon,
  FilterIcon,
  PdfIcon,
  TabletIcon,
} from "@/components/dashboard/icons";
import {
  ATIVIDADE_OPCOES,
  CAMPO_DE_DATA_OPCOES,
  CONCLUSAO_OPCOES,
  ORIGEM_OPCOES,
  SITUACAO_DA_LISTA,
  SITUACAO_OPCOES,
  STATUS_OPCOES,
  TABLE_COLUMNS,
  comPadroesDaTela,
  conclusaoDaLista,
  datasDaLinha,
  extrairFiltros,
  getHistorico,
  getOpcoesFiltros,
  hojeNoFuso,
  nomeDoChecklist,
  primeiro,
  querystringDe,
  PAGE_SIZE,
  type HistoricoLinha,
  type SearchParams,
} from "./queries";

const MIN_WIDTH = "min-w-[1480px]";

/** "Ação" nao entra em `TABLE_COLUMNS` (queries.ts) de proposito: aquela lista
 * e a das colunas de TEXTO, reaproveitada pelas exportacoes de Excel/PDF, e um
 * botao nao tem como virar celula de planilha. Mesma separacao de
 * `perguntas/page.tsx`. */
const COLUNAS_DA_TELA = [...TABLE_COLUMNS, "Ação"];

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

type SearchParamsPromise = Promise<SearchParams>;

/** Os parametros da URL com o periodo de hoje na primeira abertura (ver
 * `comPadroesDaTela`). Todo pedaco da tela le por aqui, para o filtro, a
 * tabela e os links de exportacao concordarem. */
async function lerParams(searchParams: SearchParamsPromise): Promise<SearchParams> {
  return comPadroesDaTela(await searchParams);
}

/**
 * Historico de Checklist, igual ao do sistema de referencia (revisto tela a
 * tela com o dono em 18/10/2026): os mesmos filtros na mesma ordem, as mesmas
 * colunas e os mesmos dois icones de acao. O que o sistema novo nao tem
 * (agenda, atividade, aprovacao, inativar checklist) aparece com o valor que a
 * referencia mostra no checklist avulso. As nao conformidades e o motivo, que
 * a referencia nao mostra na lista, continuam no detalhe e na Nota.
 *
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` para o porque (Cache Components).
 */
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

      {/* A unica escrita desta tela e o "Excluir checklist" do detalhe, que
          volta para ca com `salvo=1`. */}
      <Suspense fallback={null}>
        <AvisoDeSalvo searchParams={searchParams} listagem={LISTAGEM} mensagem="Checklist excluído com sucesso." />
      </Suspense>

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm transition-shadow duration-300 animate-fade-in-up hover:shadow-md"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Histórico de Checklist
          </h1>
          <Suspense fallback={<AcoesEsqueleto quantidade={4} />}>
            <AcoesDeExportacao searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={19} colunas="xl:grid-cols-6" />}>
          <FormularioDeFiltros searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS_DA_TELA.length} minWidth={MIN_WIDTH} />}>
          <TabelaDoHistorico searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Dependem so do `searchParams`, nao do banco -- por isso tem fronteira
 * propria e resolvem antes das outras duas. Na ordem e nas cores da
 * referencia: Excel, Respostas para Excel, PDF Unificado, PDF. */
async function AcoesDeExportacao({ searchParams }: { searchParams: SearchParamsPromise }) {
  // Exportar traz o resultado inteiro do filtro, nao so a pagina visivel.
  const texto = querystringDe(await lerParams(searchParams), ["pagina", "salvo"]);
  const query = texto ? `?${texto}` : "";

  return (
    <div className="flex items-center gap-2">
      <Acao titulo="Exportar para Excel" href={`${LISTAGEM}/export/excel${query}`} tom="excel" target="_blank">
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      {/* Uma linha por resposta, contra uma por checklist no botao ao lado. */}
      <Acao
        titulo="Exportar Respostas para Excel"
        href={`${LISTAGEM}/export/respostas${query}`}
        tom="excel"
        target="_blank"
      >
        <ExcelIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo="Exportar para PDF Unificado"
        href={`${LISTAGEM}/export/pdf-unificado${query}`}
        tom="pdf"
        target="_blank"
      >
        <PdfIcon className="h-4 w-4" />
      </Acao>
      <Acao titulo="Exportar para PDF" href={`${LISTAGEM}/export/pdf${query}`} tom="pdf" target="_blank">
        <PdfIcon className="h-4 w-4" />
      </Acao>
    </div>
  );
}

/**
 * GET nativo, sem JS no caminho critico -- mesmo mecanismo das demais telas.
 *
 * Quatro linhas, como a referencia, numa grade de 12 colunas no xl: a largura
 * de cada campo segue a de la (Checklists e Sites largos, notas estreitas). Em
 * tela menor a grade vira uma ou duas colunas e os spans deixam de valer.
 */
async function FormularioDeFiltros({ searchParams }: { searchParams: SearchParamsPromise }) {
  const filtros = extrairFiltros(await lerParams(searchParams));
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="border-b border-slate-800 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-2">
          <FilterSelect
            label="Tipo de Data"
            name="campo_data"
            defaultValue={filtros.campoData}
            options={CAMPO_DE_DATA_OPCOES}
            semOpcaoVazia
          />
        </div>
        <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
        <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
        <FilterInput label="Número/Ano" name="numero_ano" defaultValue={filtros.numeroAno} />
        <div className="xl:col-span-5">
          <FilterMultiSelect label="Checklists" name="modelo" options={opcoes.modelos} defaultValues={filtros.modelos} />
        </div>
        <div className="xl:col-span-2">
          <FilterSelect label="Origem" name="origem" defaultValue={filtros.origem} options={ORIGEM_OPCOES} />
        </div>

        <div className="xl:col-span-4">
          <FilterMultiSelect label="Sites" name="site" options={opcoes.sites} defaultValues={filtros.sites} />
        </div>
        <div className="xl:col-span-4">
          <FilterMultiSelect
            label="Grupos Sites"
            name="grupo_site"
            options={opcoes.gruposSites}
            defaultValues={filtros.gruposSites}
          />
        </div>
        <div className="xl:col-span-4">
          <FilterMultiSelect
            label="Grupos Usuários"
            name="grupo_usuario"
            options={opcoes.gruposUsuarios}
            defaultValues={filtros.gruposUsuarios}
          />
        </div>

        <div className="xl:col-span-2">
          <FilterSelect label="Situação" name="situacao" defaultValue={filtros.situacao} options={SITUACAO_OPCOES} />
        </div>
        <div className="xl:col-span-2">
          <FilterSelect
            label="Conclusão"
            name="conclusao"
            defaultValue={filtros.conclusao}
            options={CONCLUSAO_OPCOES}
          />
        </div>
        <div className="xl:col-span-3">
          <FilterSelect
            label="Atividade"
            name="atividade"
            defaultValue={filtros.atividade}
            options={ATIVIDADE_OPCOES}
          />
        </div>
        <FilterInput label="Nota mínima" name="nota_minima" defaultValue={filtros.notaMinima?.toString()} />
        <FilterInput label="Nota máxima" name="nota_maxima" defaultValue={filtros.notaMaxima?.toString()} />
        <div className="xl:col-span-3">
          <FilterSelect label="Status" name="status" defaultValue={filtros.status} options={STATUS_OPCOES} />
        </div>

        <div className="xl:col-span-4">
          <FilterMultiSelect
            label="Responsável"
            name="responsavel"
            options={opcoes.responsaveis}
            defaultValues={filtros.responsaveis}
          />
        </div>
        <div className="xl:col-span-3">
          <FilterInput label="Busca Livre" name="busca" defaultValue={filtros.busca} />
        </div>
        <div className="flex gap-2 xl:col-span-3">
          <div className="min-w-0 flex-1">
            <FilterInput
              label="Busca Livre Respostas tipo Texto"
              name="busca_respostas"
              defaultValue={filtros.buscaRespostas}
            />
          </div>
          <AjudaDaBuscaEmTexto />
        </div>
        <div className="xl:col-span-2">
          <Button type="submit" className="group w-full">
            <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            Filtrar
          </Button>
        </div>
      </div>
    </form>
  );
}

/** O "?" ao lado da busca em respostas, como na referencia ("Busca em campo
 * texto"). `<details>` para abrir e fechar sem JS. */
function AjudaDaBuscaEmTexto() {
  return (
    <details className="relative shrink-0">
      <summary
        title="Busca em campo texto"
        aria-label="Busca em campo texto"
        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-slate-800 bg-brand-surface text-sm font-semibold text-brand-muted transition-colors hover:border-slate-700 hover:text-white [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <p className="absolute right-0 top-11 z-20 w-64 rounded-md border border-slate-700 bg-brand-surface p-3 text-xs text-white shadow-lg">
        Procura o texto nas observações das respostas e no motivo das visitas corretivas.
      </p>
    </details>
  );
}

/** Dia (AAAA-MM-DD) da abertura da visita, para filtrar as coletas dela. */
function linkDaInspecao(linha: HistoricoLinha): string | null {
  if (linha.siteId === null) return null;
  const dia = hojeNoFuso(new Date(linha.inicioEm));
  const query = new URLSearchParams({ local: String(linha.siteId), data_inicial: dia, data_final: dia });
  if (linha.responsavelId) query.set("funcionario", linha.responsavelId);
  return `/dashboard/inspecoes/coletas-importadas?${query.toString()}`;
}

function CelulaDoSite({ linha }: { linha: HistoricoLinha }) {
  const link = linkDaInspecao(linha);
  return (
    <span className="inline-flex items-center gap-2">
      {link && (
        <Link
          href={link}
          title="Visualizar Inspeção"
          aria-label={`Visualizar inspeção do checklist ${linha.numeroAno}`}
          className="shrink-0 text-sky-200 transition-colors hover:text-white"
        >
          <ClipboardListIcon className="h-4 w-4" />
        </Link>
      )}
      <span>{linha.caminhoDoSite}</span>
    </span>
  );
}

function Selo({ texto, cor }: { texto: string; cor: "azul" | "verde" | "amarelo" }) {
  const classes = {
    azul: "bg-sky-500/15 text-sky-200",
    verde: "bg-emerald-500/15 text-emerald-300",
    amarelo: "bg-amber-500/15 text-amber-300",
  }[cor];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{texto}</span>;
}

/** A chave de Status da referencia (ativar ou inativar o checklist). O sistema
 * novo nao inativa checklist, entao ela aparece ligada e nao muda. */
function ChaveDeStatus() {
  return (
    <span
      role="switch"
      aria-checked="true"
      aria-disabled="true"
      aria-label="Ativo"
      title="Ativo"
      className="inline-flex h-5 w-9 items-center rounded-full bg-brand-green p-0.5"
    >
      <span className="ml-auto h-4 w-4 rounded-full bg-branco shadow" />
    </span>
  );
}

async function TabelaDoHistorico({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await lerParams(searchParams);
  const filtros = extrairFiltros(params);
  const pagina = Math.max(1, Number(primeiro(params.pagina)) || 1);

  // So a pagina vem do banco, ja filtrada e com as colunas calculadas
  // (`historico_de_checklist`, 0079); o total vem junto. Pagina alem do fim
  // volta como a ultima, e `historico.pagina` diz qual.
  const historico = await getHistorico(filtros, pagina);

  const totalItems = historico.total;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const paginaValida = historico.pagina;

  // Os filtros atuais viajam junto no link do detalhe para que o "Voltar ao
  // histórico" de la reencontre a mesma pagina filtrada, e nao a listagem
  // zerada. Todos os valores de cada filtro: os de selecao multipla repetem o
  // nome na URL.
  const querystringAtual = querystringDe(params, ["salvo"]);
  const sufixo = querystringAtual ? `?${querystringAtual}` : "";

  const rows = historico.linhas.map((linha) => [
    String(linha.id),
    linha.numeroAno,
    nomeDoChecklist(linha),
    <div key="datas" className="whitespace-nowrap text-xs leading-snug">
      {datasDaLinha(linha).map((data) => (
        <div key={data.rotulo}>
          {data.rotulo}: {data.valor}
        </div>
      ))}
    </div>,
    linha.responsavel,
    <CelulaDoSite key="site" linha={linha} />,
    "-",
    <Selo key="situacao" texto={SITUACAO_DA_LISTA} cor="azul" />,
    <Selo
      key="conclusao"
      texto={conclusaoDaLista(linha)}
      cor={conclusaoDaLista(linha) === "Finalizado" ? "verde" : "amarelo"}
    />,
    linha.nota === null ? "" : String(linha.nota),
    <ChaveDeStatus key="status" />,
    <div key="acao" className="flex items-center gap-1.5">
      <Acao titulo={`Visualizar checklist ${linha.numeroAno}`} href={`${LISTAGEM}/${linha.id}/visualizar`} tom="neutro">
        <EyeIcon className="h-4 w-4" />
      </Acao>
      <Acao
        titulo={`Visualizar respostas do checklist ${linha.numeroAno}`}
        href={`${LISTAGEM}/${linha.id}${sufixo}`}
        tom="excel"
      >
        <TabletIcon className="h-4 w-4" />
      </Acao>
    </div>,
  ]);

  const buildPageHref = (novaPagina: number) => {
    const query = new URLSearchParams(querystringAtual);
    query.set("pagina", String(novaPagina));
    return `?${query.toString()}`;
  };

  return (
    <>
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
