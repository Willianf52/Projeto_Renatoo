import Link from "next/link";
import { Suspense } from "react";
import { AcaoDesabilitada } from "@/components/dashboard/AcaoDesabilitada";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FiltrosEmGradeEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import {
  ChatIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ExcelIcon,
  FilterIcon,
  PdfIcon,
  PowerIcon,
  SearchIcon,
} from "@/components/dashboard/icons";
import { FUSO_DO_PROJETO } from "@/lib/data-hora";
import { podeVerTodaAOperacao } from "@/lib/permissoes";
import { aceitaAndamento } from "./andamentos";
import { DescricaoDoEvento } from "./DescricaoDoEvento";
import {
  anelDoStatus,
  corDoStatus,
  extrairFiltros,
  getOpcoesFiltros,
  getPainel,
  PAGE_SIZE,
  primeiro,
  rotuloDoStatus,
  STATUS,
  tempoEmAberto,
  type Filtros,
  type LinhaDoPainel,
  type Painel,
  type SearchParams,
} from "./queries";

const BASE = "/dashboard/eventos/painel-de-eventos";
const COLUNAS = [
  "Número / Ano",
  "Data",
  "Hora",
  "Site",
  "Evento",
  "Setor Responsável",
  "Usuário Responsável",
  "Usuário Abertura",
  "Status",
  "Ações",
];
const MIN_WIDTH = "min-w-[1180px]";

type SearchParamsPromise = Promise<SearchParams>;

/**
 * Painel de Eventos (item 2 do plano da #164). Fora do menu, como no sistema
 * de referencia: a lupa do Registro de Eventos abre esta tela ja filtrada.
 * As regras e a consulta estao em `queries.ts`.
 *
 * "Analisar" e "Finalizar" levam ao detalhe (0064, item 5 do plano). So
 * quem ve toda a operacao age; para os demais ficam desabilitados.
 *
 * Pagina sem `async` -- ver o cabecalho de
 * `inspecoes/coletas-importadas/page.tsx` (Cache Components).
 */
export default function PainelDeEventosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "Eventos" }, { label: "Painel de Eventos" }]} />
      </div>

      <Suspense fallback={<TabelaEsqueleto colunas={10} linhas={8} minWidth={MIN_WIDTH} />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const agora = new Date();
  const filtros = extrairFiltros(params, agora);
  const [painel, podeAgir] = await Promise.all([getPainel(filtros), podeVerTodaAOperacao()]);

  return (
    <>
      <ResumoPorStatus painel={painel} />

      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardListIcon className="h-4 w-4" />
            Painel de Eventos
          </h1>
          <div className="flex items-center gap-2">
            <AcaoDesabilitada titulo="Exportar Eventos para PDF Unificado" className="bg-red-600/40">
              <PdfIcon className="h-4 w-4" />
            </AcaoDesabilitada>
            <AcaoDesabilitada titulo="Exportar para CSV" className="bg-emerald-600/40">
              <ExcelIcon className="h-4 w-4" />
            </AcaoDesabilitada>
          </div>
        </div>

        <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={11} colunas="xl:grid-cols-4" />}>
          <FormularioDeFiltros filtros={filtros} />
        </Suspense>

        <DataTable
          columns={COLUNAS}
          rows={painel.linhas.map((linha) => celulas(linha, agora, podeAgir))}
          page={filtros.pagina}
          totalPages={Math.max(1, Math.ceil(painel.total / PAGE_SIZE))}
          totalItems={painel.total}
          buildPageHref={(pagina) => hrefDaPagina(params, pagina)}
          emptyTitle="Nenhum evento encontrado"
          emptyDescription="Ajuste o período ou os filtros acima para localizar registros."
          minWidth={MIN_WIDTH}
          rotulo="Painel de eventos"
        />
      </div>
    </>
  );
}

/** Os cartoes do topo: quantos em cada status, e quanto isso e do total. */
function ResumoPorStatus({ painel }: { painel: Painel }) {
  const total = painel.resumo.reduce((soma, item) => soma + item.quantidade, 0);
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap justify-end gap-3 animate-fade-in-up">
      {painel.resumo.map((item) => {
        const percentual = Math.round((item.quantidade / total) * 100);
        return (
          <div
            key={item.status}
            className="flex min-w-[240px] items-center justify-between gap-4 rounded-lg border border-slate-800 bg-brand-surface px-5 py-4"
          >
            <div>
              <p className="text-2xl font-bold text-white">{item.quantidade}</p>
              <p className="text-sm text-brand-muted">{rotuloDoStatus(item.status)}</p>
            </div>
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: `conic-gradient(${anelDoStatus(item.status)} ${percentual * 3.6}deg, rgb(30 41 59) 0deg)` }}
              role="img"
              aria-label={`${percentual}% das ocorrências`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-xs italic text-brand-muted">
                {percentual}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function FormularioDeFiltros({ filtros }: { filtros: Filtros }) {
  const opcoes = await getOpcoesFiltros();

  return (
    <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <FilterDatePicker label="Data Inicial" name="data_inicial" defaultValue={filtros.dataInicial} />
      <FilterDatePicker label="Data Final" name="data_final" defaultValue={filtros.dataFinal} />
      <div className="sm:col-span-2">
        <FilterInput label="Busca Livre (pergunta ou observação)" name="busca" defaultValue={filtros.busca} />
      </div>
      <FilterSelect label="Sites" name="sites" defaultValue={filtros.sites} options={opcoes.sites} />
      <FilterSelect
        label="Status"
        name="status"
        defaultValue={filtros.status}
        options={STATUS.map((s) => ({ value: s.value, label: s.label }))}
      />
      <FilterInput label="Número" name="numero" defaultValue={filtros.numero} />
      <FilterInput label="Ano" name="ano" defaultValue={filtros.ano} />
      <FilterSelect label="Tipos de Evento" name="evento" defaultValue={filtros.evento} options={opcoes.eventos} />
      <FilterSelect label="Grupo de Sites" name="grupo_site" defaultValue={filtros.grupoSite} options={opcoes.grupos} />
      <FilterSelect label="Usuário Abertura" name="usuario" defaultValue={filtros.usuario} options={opcoes.usuarios} />
      <div className="flex gap-2">
        <Button type="submit" className="group flex-1">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
        <Button href={BASE} variant="secondary" className="flex-1">
          Limpar
        </Button>
      </div>
    </form>
  );
}

const DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: FUSO_DO_PROJETO });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: FUSO_DO_PROJETO });

function celulas(linha: LinhaDoPainel, agora: Date, podeAgir: boolean): React.ReactNode[] {
  const criado = new Date(linha.criadoEm);
  return [
    linha.numeroAno,
    DATA.format(criado),
    HORA.format(criado),
    <CaminhoDoSite key="site" niveis={linha.siteNiveis} />,
    linha.evento,
    "",
    linha.usuarioAbertura,
    linha.usuarioAbertura,
    <StatusComTempo key="status" status={linha.status} criadoEm={linha.criadoEm} agora={agora} />,
    <div key="acoes" className="flex items-center gap-1">
      <DescricaoDoEvento numeroAno={linha.numeroAno} linhas={linha.descricao} />
      <Link
        href={`${BASE}/${linha.id}`}
        title="Ver Detalhes"
        aria-label={`Ver detalhes do evento ${linha.numeroAno}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
      >
        <SearchIcon className="h-4 w-4" />
      </Link>
      <AcaoDeAndamento linha={linha} ancora="analise" titulo="Analisar este Evento" podeAgir={podeAgir}>
        <ChatIcon className="h-4 w-4" />
      </AcaoDeAndamento>
      <AcaoDeAndamento linha={linha} ancora="finalizar" titulo="Finalizar o Atendimento deste Evento" podeAgir={podeAgir}>
        <PowerIcon className="h-4 w-4" />
      </AcaoDeAndamento>
    </div>,
  ];
}

/**
 * "Analisar" e "Finalizar": levam ao detalhe da ocorrencia com a secao ja
 * aberta (`#analise`, `#finalizar`). So quem ve toda a operacao age, e so em
 * ocorrencia que ainda aceita andamento -- o banco confere de novo (0064).
 */
function AcaoDeAndamento({
  linha,
  ancora,
  titulo,
  podeAgir,
  children,
}: {
  linha: LinhaDoPainel;
  ancora: "analise" | "finalizar";
  titulo: string;
  podeAgir: boolean;
  children: React.ReactNode;
}) {
  if (!podeAgir || !aceitaAndamento(linha.status)) {
    return (
      <AcaoDesabilitada
        titulo={titulo}
        motivo={podeAgir ? "ocorrência encerrada" : "sem permissão"}
        className="h-8 w-8 hover:bg-transparent"
      >
        {children}
      </AcaoDesabilitada>
    );
  }

  return (
    <Link
      href={`${BASE}/${linha.id}#${ancora}`}
      title={titulo}
      aria-label={`${titulo}: evento ${linha.numeroAno}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

/** O status com o tempo desde a abertura (dias, horas, minutos). */
function StatusComTempo({ status, criadoEm, agora }: { status: string; criadoEm: string; agora: Date }) {
  const { dias, horas, minutos } = tempoEmAberto(criadoEm, agora);
  return (
    <div className="w-36 overflow-hidden rounded-md border border-slate-700 text-center">
      <p className={`px-2 py-1 text-xs font-semibold text-white ${corDoStatus(status)}`}>{rotuloDoStatus(status)}</p>
      <div className="grid grid-cols-3 py-1">
        {[
          [dias, "Dias"],
          [horas, "Hor"],
          [minutos, "Min"],
        ].map(([valor, rotulo]) => (
          <span key={rotulo} className="flex flex-col">
            <span className="text-base text-white">{valor}</span>
            <span className="text-[10px] uppercase text-brand-muted">{rotulo}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CaminhoDoSite({ niveis }: { niveis: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {niveis.map((nivel, indice) => (
        <span key={indice} className="inline-flex items-center gap-1">
          {indice > 0 && <ChevronRightIcon className="h-3.5 w-3.5 text-brand-muted" aria-hidden />}
          <span className={indice === niveis.length - 1 ? "text-white" : "text-brand-muted"}>{nivel}</span>
        </span>
      ))}
    </span>
  );
}

function hrefDaPagina(params: SearchParams, pagina: number): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v && chave !== "pagina") query.set(chave, v);
  }
  if (pagina > 1) query.set("pagina", String(pagina));
  const texto = query.toString();
  return texto ? `${BASE}?${texto}` : BASE;
}

