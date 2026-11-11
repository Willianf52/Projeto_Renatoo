import Link from "next/link";
import { Suspense } from "react";
import { Acao } from "@/components/dashboard/Acao";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { Button } from "@/components/Button";
import { DataTable } from "@/components/dashboard/DataTable";
import { FiltrosEmGradeEsqueleto, TabelaEsqueleto } from "@/components/dashboard/EsqueletosDeListagem";
import { FilterSelect } from "@/components/dashboard/FilterField";
import { ClipboardListIcon, ExcelIcon, FilterIcon, PdfIcon } from "@/components/dashboard/icons";
import { AGENDAMENTOS, corDoStatus, LISTAGEM, rotuloDoStatus, STATUS_DO_AGENDAMENTO } from "../agendas/regras";
import {
  DIAS_DA_SEMANA,
  mesmoMes,
  navegar,
  numeroDoDia,
  semanasDoMes,
  somarDias,
  tituloDaVisao,
  VISOES,
} from "./calendario";
import {
  extrairFiltros,
  getAgendamentos,
  getOpcoesDosFiltros,
  hojeEmBrasilia,
  PAGE_SIZE,
  primeiro,
  type Agendamento,
  type Filtros,
  type SearchParams,
} from "./queries";

type SearchParamsPromise = Promise<SearchParams>;

const COLUNAS = ["Data Planejada", "Prazo", "Agenda", "Checklist", "Site", "Responsável", "Status", "Realizado em"];
const MIN_WIDTH = "min-w-[1100px]";
const HISTORICO = "/dashboard/checklistlab/historico-de-checklist";
/** Agendamentos que cabem numa celula do Mes antes do "+N". */
const POR_CELULA = 3;

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const data = (iso: string) => DATA.format(new Date(`${iso}T12:00:00Z`));

/**
 * "Agendamentos" do ChecklistLab (0084), como CALENDARIO desde 11/11/2026: as
 * visoes Mes, Semana, Dia e Lista do sistema de referencia, com a legenda dos
 * 6 status (0098). Pagina sem `async` (Cache Components); a navegacao e por
 * link, entao o calendario inteiro sai do servidor.
 */
export default function AgendamentosPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  return (
    <div className="space-y-4">
      <div className="animate-fade-in">
        <Breadcrumbs items={[{ label: "ChecklistLab" }, { label: "Agendamentos" }]} />
      </div>
      <div
        className="overflow-hidden rounded-lg bg-brand-surface shadow-sm animate-fade-in-up"
        style={{ animationDelay: "80ms" }}
      >
        <Suspense fallback={<TabelaEsqueleto colunas={COLUNAS.length} linhas={8} minWidth={MIN_WIDTH} />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/** Os filtros da tela numa query, trocando o que vier em `troca` (vazio apaga). */
function consulta(params: SearchParams, troca: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor);
    if (v && chave !== "pagina" && !(chave in troca)) query.set(chave, v);
  }
  for (const [chave, valor] of Object.entries(troca)) if (valor) query.set(chave, valor);
  const texto = query.toString();
  return texto ? `?${texto}` : "";
}

async function Conteudo({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams;
  const agora = new Date();
  const filtros = extrairFiltros(params, agora);
  const agendamentos = await getAgendamentos(filtros);
  // As exportacoes levam o periodo que esta na tela.
  const doPeriodo = consulta(params, { data_inicial: filtros.dataInicial, data_final: filtros.dataFinal });

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardListIcon className="h-4 w-4" />
          Agendamentos
        </h1>
        <div className="flex items-center gap-2">
          <Acao titulo="Exportar para Excel" href={`${AGENDAMENTOS}/export/excel${doPeriodo}`} tom="excel" target="_blank">
            <ExcelIcon className="h-4 w-4" />
          </Acao>
          <Acao titulo="Exportar para PDF" href={`${AGENDAMENTOS}/export/pdf${doPeriodo}`} tom="pdf" baixar>
            <PdfIcon className="h-4 w-4" />
          </Acao>
          <Link href={LISTAGEM} className="text-xs text-brand-green hover:underline">
            Criar Agenda
          </Link>
        </div>
      </div>

      <Suspense fallback={<FiltrosEmGradeEsqueleto celulas={8} colunas="xl:grid-cols-4" />}>
        <FormularioDeFiltros filtros={filtros} />
      </Suspense>

      <Legenda agendamentos={agendamentos} />

      <BarraDoCalendario params={params} filtros={filtros} hoje={hojeEmBrasilia(agora)} />

      {filtros.visao === "mes" && (
        <GradeDoMes params={params} filtros={filtros} agendamentos={agendamentos} hoje={hojeEmBrasilia(agora)} />
      )}
      {filtros.visao === "semana" && (
        <GradeDaSemana params={params} filtros={filtros} agendamentos={agendamentos} hoje={hojeEmBrasilia(agora)} />
      )}
      {(filtros.visao === "dia" || filtros.visao === "lista") && (
        <Lista params={params} filtros={filtros} agendamentos={agendamentos} />
      )}
    </>
  );
}

/** A legenda do antigo: os 6 status com a cor e quantos ha no periodo. */
function Legenda({ agendamentos }: { agendamentos: Agendamento[] }) {
  return (
    <ul aria-label="Legenda dos status" className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3 text-xs">
      {STATUS_DO_AGENDAMENTO.map((s) => (
        <li key={s.value} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${s.cor}`} aria-hidden />
          {s.label}: <strong className="text-white">{agendamentos.filter((a) => a.status === s.value).length}</strong>
        </li>
      ))}
    </ul>
  );
}

function BarraDoCalendario({ params, filtros, hoje }: { params: SearchParams; filtros: Filtros; hoje: string }) {
  const ir = (troca: Record<string, string | undefined>) => `${AGENDAMENTOS}${consulta(params, troca)}`;
  const botao =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-700 px-2 text-sm text-slate-200 transition-colors hover:border-brand-green hover:text-white";
  return (
    <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <Link href={ir({ data: navegar(filtros.visao, filtros.data, -1) })} className={botao} aria-label="Anterior">
          ‹
        </Link>
        <Link href={ir({ data: navegar(filtros.visao, filtros.data, 1) })} className={botao} aria-label="Próximo">
          ›
        </Link>
        <Link href={ir({ data: hoje })} className={botao}>
          Hoje
        </Link>
      </div>
      <h2 className="text-center text-base font-semibold text-white">{tituloDaVisao(filtros.visao, filtros.data)}</h2>
      <nav aria-label="Visão do calendário" className="flex overflow-hidden rounded-md border border-slate-700">
        {VISOES.map((v) => (
          <Link
            key={v.value}
            href={ir({ visao: v.value })}
            aria-current={filtros.visao === v.value ? "page" : undefined}
            className={`px-3 py-1.5 text-sm transition-colors ${
              filtros.visao === v.value ? "bg-brand-green font-semibold text-brand-navy" : "text-slate-200 hover:bg-slate-800"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Um agendamento no calendario: a cor do status, o site e o resto no titulo. Feito, abre o checklist. */
function Evento({ a }: { a: Agendamento }) {
  const titulo = `${a.site} | ${a.agenda} | ${a.modelo} | ${rotuloDoStatus(a.status)}${a.responsavel ? ` | ${a.responsavel}` : ""}`;
  const classe = `block truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-branco ${corDoStatus(a.status)}`;
  return a.checklistId ? (
    <Link href={`${HISTORICO}/${a.checklistId}`} title={titulo} className={`${classe} hover:opacity-90`}>
      {a.site}
    </Link>
  ) : (
    <span title={titulo} className={classe}>
      {a.site}
    </span>
  );
}

function porDia(agendamentos: Agendamento[]): Map<string, Agendamento[]> {
  const mapa = new Map<string, Agendamento[]>();
  for (const a of agendamentos) mapa.set(a.dataPlanejada, [...(mapa.get(a.dataPlanejada) ?? []), a]);
  return mapa;
}

function CabecalhoDosDias() {
  return (
    <div className="grid grid-cols-7 border-b border-slate-800 text-center text-xs font-semibold uppercase text-brand-muted">
      {DIAS_DA_SEMANA.map((d) => (
        <div key={d} className="py-2">
          {d}
        </div>
      ))}
    </div>
  );
}

function GradeDoMes({
  params,
  filtros,
  agendamentos,
  hoje,
}: {
  params: SearchParams;
  filtros: Filtros;
  agendamentos: Agendamento[];
  hoje: string;
}) {
  const doDia = porDia(agendamentos);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <CabecalhoDosDias />
        {semanasDoMes(filtros.data).map((semana) => (
          <div key={semana[0]} className="grid grid-cols-7 border-b border-slate-800 last:border-b-0">
            {semana.map((dia) => {
              const lista = doDia.get(dia) ?? [];
              const linkDoDia = `${AGENDAMENTOS}${consulta(params, { visao: "dia", data: dia })}`;
              return (
                <div
                  key={dia}
                  className={`min-h-28 border-r border-slate-800 p-1.5 last:border-r-0 ${
                    mesmoMes(dia, filtros.data) ? "" : "bg-brand-navy/40"
                  }`}
                >
                  <Link
                    href={linkDoDia}
                    aria-label={`Ver o dia ${data(dia)}`}
                    className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
                      dia === hoje
                        ? "bg-brand-green font-bold text-brand-navy"
                        : mesmoMes(dia, filtros.data)
                          ? "text-slate-200 hover:bg-slate-800"
                          : "text-brand-muted hover:bg-slate-800"
                    }`}
                  >
                    {numeroDoDia(dia)}
                  </Link>
                  <div className="space-y-0.5">
                    {lista.slice(0, POR_CELULA).map((a) => (
                      <Evento key={`${a.agendaId}-${a.siteId}`} a={a} />
                    ))}
                    {lista.length > POR_CELULA && (
                      <Link href={linkDoDia} className="block px-1 text-[11px] text-brand-green hover:underline">
                        +{lista.length - POR_CELULA} mais
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeDaSemana({
  params,
  filtros,
  agendamentos,
  hoje,
}: {
  params: SearchParams;
  filtros: Filtros;
  agendamentos: Agendamento[];
  hoje: string;
}) {
  const doDia = porDia(agendamentos);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(filtros.dataInicial, i));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <CabecalhoDosDias />
        <div className="grid grid-cols-7">
          {dias.map((dia) => (
            <div key={dia} className="min-h-64 border-r border-slate-800 p-1.5 last:border-r-0">
              <Link
                href={`${AGENDAMENTOS}${consulta(params, { visao: "dia", data: dia })}`}
                aria-label={`Ver o dia ${data(dia)}`}
                className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
                  dia === hoje ? "bg-brand-green font-bold text-brand-navy" : "text-slate-200 hover:bg-slate-800"
                }`}
              >
                {numeroDoDia(dia)}
              </Link>
              <div className="space-y-0.5">
                {(doDia.get(dia) ?? []).map((a) => (
                  <Evento key={`${a.agendaId}-${a.siteId}`} a={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dia e Lista: a tabela de sempre, com o periodo da visao. */
function Lista({ params, filtros, agendamentos }: { params: SearchParams; filtros: Filtros; agendamentos: Agendamento[] }) {
  const pagina = agendamentos.slice((filtros.pagina - 1) * PAGE_SIZE, filtros.pagina * PAGE_SIZE);
  return (
    <DataTable
      columns={COLUNAS}
      rows={pagina.map(celulas)}
      page={filtros.pagina}
      totalPages={Math.max(1, Math.ceil(agendamentos.length / PAGE_SIZE))}
      totalItems={agendamentos.length}
      buildPageHref={(p) => `${AGENDAMENTOS}${consulta(params, { pagina: String(p) })}`}
      emptyTitle={filtros.visao === "dia" ? "Nenhum agendamento neste dia" : "Nenhum agendamento no mês"}
      emptyDescription="Mude o período nas setas acima ou crie uma agenda em Criar Agenda."
      minWidth={MIN_WIDTH}
      rotulo="Agendamentos"
    />
  );
}

function celulas(a: Agendamento): React.ReactNode[] {
  return [
    data(a.dataPlanejada),
    data(a.prazo),
    a.agenda,
    a.modelo,
    a.site,
    a.responsavel,
    <span key="status" className={`rounded px-2 py-0.5 text-xs font-semibold text-branco ${corDoStatus(a.status)}`}>
      {rotuloDoStatus(a.status)}
    </span>,
    a.checklistId && a.realizadoEm ? (
      <Link key="feito" href={`${HISTORICO}/${a.checklistId}`} className="text-brand-green hover:underline">
        {DATA_HORA.format(new Date(a.realizadoEm))}
      </Link>
    ) : (
      ""
    ),
  ];
}

/** Os filtros do sistema de referencia, sem datas: o periodo e o do calendario. */
async function FormularioDeFiltros({ filtros }: { filtros: Filtros }) {
  const opcoes = await getOpcoesDosFiltros();
  return (
    <form method="get" className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Filtrar mantem a visao e a data em que o calendario esta. */}
      <input type="hidden" name="visao" value={filtros.visao} />
      <input type="hidden" name="data" value={filtros.data} />
      <FilterSelect label="Agendas" name="agenda" defaultValue={filtros.agenda} options={opcoes.agendas} />
      <FilterSelect label="Checklist" name="modelo" defaultValue={filtros.modelo} options={opcoes.modelos} />
      <FilterSelect label="Sites" name="site" defaultValue={filtros.site} options={opcoes.sites} />
      <FilterSelect label="Grupo de Sites" name="grupo_site" defaultValue={filtros.grupoSite} options={opcoes.gruposSites} />
      <FilterSelect label="Responsável" name="responsavel" defaultValue={filtros.responsavel} options={opcoes.usuarios} />
      <FilterSelect
        label="Grupo de Usuário"
        name="grupo_usuario"
        defaultValue={filtros.grupoUsuario}
        options={opcoes.gruposUsuarios}
      />
      <FilterSelect
        label="Status"
        name="status"
        defaultValue={filtros.status}
        options={STATUS_DO_AGENDAMENTO.map((s) => ({ value: s.value, label: s.label }))}
      />
      <div className="flex gap-2">
        <Button type="submit" className="group flex-1">
          <FilterIcon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          Filtrar
        </Button>
        <Button href={AGENDAMENTOS} variant="secondary" className="flex-1">
          Limpar
        </Button>
      </div>
    </form>
  );
}
