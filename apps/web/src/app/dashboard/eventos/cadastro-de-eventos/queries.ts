import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { formatarMinutos } from "./regras";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/** "Ativos" e o padrao, como na referencia. */
export type Situacao = "ativos" | "inativos" | "todos";

export const SITUACOES: { value: Situacao; label: string }[] = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "todos", label: "Todos" },
];

export type Filtros = { busca?: string; situacao: Situacao };

export function extrairFiltros(params: SearchParams): Filtros {
  const situacao = primeiro(params.situacao);
  return {
    busca: primeiro(params.busca)?.trim().slice(0, 100) || undefined,
    situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
  };
}

export type Opcao = { value: string; label: string };

export type EventoDaLista = {
  id: number;
  nome: string;
  descricao: string;
  superiorId: number | null;
  superior: string;
  sites: { id: number; nome: string }[];
  /** Vazio para quem nao e GESTOR: o RLS de `eventos_notificacoes` (0072). */
  emails: string[];
  tempoAtendimentoMinutos: number | null;
  bloqueioRepeticaoMinutos: number | null;
  ativo: boolean;
};

type EventoDoBanco = {
  id: number;
  nome: string;
  descricao: string | null;
  superior_id: number | null;
  tempo_atendimento_minutos: number | null;
  bloqueio_repeticao_minutos: number | null;
  ativo: boolean;
};

type SiteDoBanco = { id: number; nome: string; ativo: boolean; grupos_sites: { nome: string } | null };

/**
 * Tudo de uma vez, sem paginar no banco: sao dezenas de eventos (29 na
 * referencia). Os vinculos vem em consultas separadas, e nao por embed: o
 * auto-relacionamento de `eventos` (superior) deixaria o embed ambiguo.
 */
async function carregarTudo() {
  const supabase = await createClient();
  const [eventos, vinculos, notificacoes, sites] = await Promise.all([
    buscarEmPaginas<EventoDoBanco>((de, ate) =>
      supabase
        .from("eventos")
        .select("id, nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo")
        .order("id")
        .range(de, ate),
    ),
    buscarEmPaginas<{ evento_id: number; site_id: number }>((de, ate) =>
      supabase.from("eventos_sites").select("evento_id, site_id").order("evento_id").order("site_id").range(de, ate),
    ),
    buscarEmPaginas<{ evento_id: number; emails: string[] }>((de, ate) =>
      supabase.from("eventos_notificacoes").select("evento_id, emails").order("evento_id").range(de, ate),
    ),
    buscarEmPaginas<SiteDoBanco>((de, ate) =>
      supabase.from("sites").select("id, nome, ativo, grupos_sites ( nome )").order("id").range(de, ate),
    ),
  ]);
  return { eventos: eventos.linhas, vinculos: vinculos.linhas, notificacoes: notificacoes.linhas, sites: sites.linhas };
}

function rotuloDoSite(site: SiteDoBanco): string {
  return site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome;
}

/** Pura: junta as quatro leituras numa linha por evento. */
export function montarEventos(dados: Awaited<ReturnType<typeof carregarTudo>>): EventoDaLista[] {
  const nomeDoEvento = new Map(dados.eventos.map((e) => [e.id, e.nome]));
  const nomeDoSite = new Map(dados.sites.map((s) => [s.id, rotuloDoSite(s)]));
  const emails = new Map(dados.notificacoes.map((n) => [n.evento_id, n.emails]));
  const sitesDoEvento = new Map<number, { id: number; nome: string }[]>();
  for (const v of dados.vinculos) {
    const lista = sitesDoEvento.get(v.evento_id) ?? [];
    // Site fora do escopo de quem le some do nome, mas o vinculo existe.
    lista.push({ id: v.site_id, nome: nomeDoSite.get(v.site_id) ?? `Site ${v.site_id}` });
    sitesDoEvento.set(v.evento_id, lista);
  }

  return dados.eventos
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      descricao: e.descricao ?? "",
      superiorId: e.superior_id,
      superior: e.superior_id === null ? "" : (nomeDoEvento.get(e.superior_id) ?? ""),
      sites: (sitesDoEvento.get(e.id) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      emails: emails.get(e.id) ?? [],
      tempoAtendimentoMinutos: e.tempo_atendimento_minutos,
      bloqueioRepeticaoMinutos: e.bloqueio_repeticao_minutos,
      ativo: e.ativo,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Pura. A busca casa nome, descricao ou o codigo (ID), como "Filtre por
 * descrição ou codigo" da referencia. */
export function filtrarEventos(eventos: EventoDaLista[], filtros: Filtros): EventoDaLista[] {
  const termo = filtros.busca?.toLowerCase();
  return eventos.filter((e) => {
    if (filtros.situacao === "ativos" && !e.ativo) return false;
    if (filtros.situacao === "inativos" && e.ativo) return false;
    if (!termo) return true;
    return (
      e.nome.toLowerCase().includes(termo) || e.descricao.toLowerCase().includes(termo) || String(e.id) === termo
    );
  });
}

export async function getEventos(filtros: Filtros): Promise<EventoDaLista[]> {
  return filtrarEventos(montarEventos(await carregarTudo()), filtros);
}

export type DadosDoFormulario = {
  evento: EventoDaLista | null;
  /** Eventos que podem ser "Superior": ativos, sem superior, e nao o proprio. */
  superiores: Opcao[];
  /** Evento com subtipos nao pode ganhar superior (um nivel, 0072). */
  temSubtipos: boolean;
  sites: Opcao[];
};

export async function getDadosDoFormulario(id: number | null): Promise<DadosDoFormulario | null> {
  const dados = await carregarTudo();
  const eventos = montarEventos(dados);
  const evento = id === null ? null : (eventos.find((e) => e.id === id) ?? null);
  if (id !== null && !evento) return null;

  return {
    evento,
    superiores: eventos
      .filter((e) => e.ativo && e.superiorId === null && e.id !== id)
      .map((e) => ({ value: String(e.id), label: e.nome })),
    temSubtipos: id !== null && eventos.some((e) => e.superiorId === id),
    sites: dados.sites
      .filter((s) => s.ativo || evento?.sites.some((v) => v.id === s.id))
      .map((s) => ({ value: String(s.id), label: rotuloDoSite(s) }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  };
}

export const COLUNAS = [
  "ID",
  "Nome",
  "Descrição",
  "Superior",
  "Sites",
  "E-mails",
  "Tempo para Atendimento",
  "Bloqueio de Repetição",
  "Status",
];

export function paraLinhaDeExportacao(e: EventoDaLista): string[] {
  return [
    String(e.id),
    e.nome,
    e.descricao,
    e.superior,
    e.sites.map((s) => s.nome).join("; "),
    e.emails.join("; "),
    formatarMinutos(e.tempoAtendimentoMinutos),
    formatarMinutos(e.bloqueioRepeticaoMinutos),
    e.ativo ? "Ativo" : "Inativo",
  ];
}
