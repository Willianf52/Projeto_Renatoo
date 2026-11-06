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

export type Filtros = {
  busca?: string;
  situacao: Situacao;
  /** Grupo de Usuarios / de Locais nas permissoes do evento (0089), como os filtros do antigo. */
  grupoUsuario?: string;
  grupoLocal?: string;
};

const SO_NUMERO = /^\d{1,12}$/;

export function extrairFiltros(params: SearchParams): Filtros {
  const situacao = primeiro(params.situacao);
  const grupoUsuario = primeiro(params.grupo_usuario);
  const grupoLocal = primeiro(params.grupo_local);
  return {
    grupoUsuario: grupoUsuario && SO_NUMERO.test(grupoUsuario) ? grupoUsuario : undefined,
    grupoLocal: grupoLocal && SO_NUMERO.test(grupoLocal) ? grupoLocal : undefined,
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
  /** Campos da 0083, como no Cadastro de Eventos do sistema de referencia. */
  extras: ExtrasDoEvento;
};

export type ExtrasDoEvento = {
  tempoFinalizacaoMinutos: number | null;
  statusFinal: string;
  usuarioFinalId: string;
  responsavelAtendimentoId: string;
  enviarSuperiorImediato: boolean;
  emailsCopia: string[];
  prorrogacaoMinutos: number | null;
  alarme: boolean;
  finalizacaoAutomatica: boolean;
  finalizacaoPelaOcorrenciaInicio: boolean;
  nps: string;
  tipoClassificacaoId: string;
  grupoResponsavelId: string;
  setorResponsavelId: string;
};

type EventoDoBanco = {
  id: number;
  nome: string;
  descricao: string | null;
  superior_id: number | null;
  tempo_atendimento_minutos: number | null;
  bloqueio_repeticao_minutos: number | null;
  ativo: boolean;
  // Opcionais: a leitura da 0083; os testes antigos montam sem eles.
  tempo_finalizacao_minutos?: number | null;
  status_final?: string | null;
  usuario_final_id?: string | null;
  responsavel_atendimento_id?: string | null;
  enviar_superior_imediato?: boolean;
  emails_copia?: string[];
  prorrogacao_minutos?: number | null;
  alarme?: boolean;
  finalizacao_automatica?: boolean;
  finalizacao_pela_ocorrencia_inicio?: boolean;
  nps?: string | null;
  tipo_classificacao_id?: number | null;
  grupo_responsavel_id?: number | null;
  setor_responsavel_id?: number | null;
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
        .select(
          `id, nome, descricao, superior_id, tempo_atendimento_minutos, bloqueio_repeticao_minutos, ativo,
           tempo_finalizacao_minutos, status_final, usuario_final_id, responsavel_atendimento_id,
           enviar_superior_imediato, emails_copia, prorrogacao_minutos, alarme, finalizacao_automatica,
           finalizacao_pela_ocorrencia_inicio, nps, tipo_classificacao_id, grupo_responsavel_id,
           setor_responsavel_id`,
        )
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
      extras: {
        tempoFinalizacaoMinutos: e.tempo_finalizacao_minutos ?? null,
        statusFinal: e.status_final ?? "",
        usuarioFinalId: e.usuario_final_id ?? "",
        responsavelAtendimentoId: e.responsavel_atendimento_id ?? "",
        enviarSuperiorImediato: e.enviar_superior_imediato ?? false,
        emailsCopia: e.emails_copia ?? [],
        prorrogacaoMinutos: e.prorrogacao_minutos ?? null,
        alarme: e.alarme ?? false,
        finalizacaoAutomatica: e.finalizacao_automatica ?? false,
        finalizacaoPelaOcorrenciaInicio: e.finalizacao_pela_ocorrencia_inicio ?? false,
        nps: e.nps ?? "",
        tipoClassificacaoId: e.tipo_classificacao_id ? String(e.tipo_classificacao_id) : "",
        grupoResponsavelId: e.grupo_responsavel_id ? String(e.grupo_responsavel_id) : "",
        setorResponsavelId: e.setor_responsavel_id ? String(e.setor_responsavel_id) : "",
      },
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

/** Pura: ficam so os eventos com permissao (qualquer canal) para os grupos escolhidos. */
export function filtrarPorGrupos(
  eventos: EventoDaLista[],
  permissoes: { evento_id: number; grupo_site_id: number | null; grupo_usuario_id: number | null }[],
  filtros: Pick<Filtros, "grupoUsuario" | "grupoLocal">,
): EventoDaLista[] {
  const permitidos = (coluna: "grupo_site_id" | "grupo_usuario_id", grupo: string | undefined) =>
    grupo === undefined
      ? null
      : new Set(permissoes.filter((p) => String(p[coluna]) === grupo).map((p) => p.evento_id));
  const dosLocais = permitidos("grupo_site_id", filtros.grupoLocal);
  const dosUsuarios = permitidos("grupo_usuario_id", filtros.grupoUsuario);
  return eventos.filter((e) => (!dosLocais || dosLocais.has(e.id)) && (!dosUsuarios || dosUsuarios.has(e.id)));
}

export async function getEventos(filtros: Filtros): Promise<EventoDaLista[]> {
  let eventos = filtrarEventos(montarEventos(await carregarTudo()), filtros);
  if (filtros.grupoUsuario || filtros.grupoLocal) {
    const supabase = await createClient();
    const { linhas } = await buscarEmPaginas<{
      evento_id: number;
      grupo_site_id: number | null;
      grupo_usuario_id: number | null;
    }>((de, ate) =>
      supabase
        .from("evento_permissoes")
        .select("evento_id, grupo_site_id, grupo_usuario_id")
        .order("id")
        .range(de, ate),
    );
    eventos = filtrarPorGrupos(eventos, linhas, filtros);
  }
  return eventos;
}

/** As listas dos filtros Grupo de Usuarios e Grupo de Locais. */
export async function getOpcoesDosGrupos(): Promise<{ usuarios: Opcao[]; locais: Opcao[] }> {
  const supabase = await createClient();
  const [usuarios, locais] = await Promise.all([
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
  ]);
  return {
    usuarios: (usuarios.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    locais: (locais.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
  };
}

export type DadosDoFormulario = {
  evento: EventoDaLista | null;
  /** Eventos que podem ser "Superior": ativos, sem superior, e nao o proprio. */
  superiores: Opcao[];
  /** Evento com subtipos nao pode ganhar superior (um nivel, 0072). */
  temSubtipos: boolean;
  sites: Opcao[];
  /** Para Responsavel e Usuario final (0083). */
  usuarios: Opcao[];
  classificacoes: Opcao[];
  gruposDeUsuarios: Opcao[];
  setores: Opcao[];
  /** Para as permissoes de visualizacao (0089). */
  gruposDeLocais: Opcao[];
  permissoes: { canal: string; grupoSiteId: number | null; grupoUsuarioId: number | null }[];
};

export async function getDadosDoFormulario(id: number | null): Promise<DadosDoFormulario | null> {
  const supabase = await createClient();
  const [dados, usuarios, classificacoes, grupos, setores, gruposDeLocais, permissoes] = await Promise.all([
    carregarTudo(),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("tipos_de_classificacao").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    id === null
      ? Promise.resolve({ data: [] as { canal: string; grupo_site_id: number | null; grupo_usuario_id: number | null }[] })
      : supabase.from("evento_permissoes").select("canal, grupo_site_id, grupo_usuario_id").eq("evento_id", id),
  ]);
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
    usuarios: (usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome_completo ?? "" })),
    classificacoes: (classificacoes.data ?? []).map((c) => ({ value: String(c.id), label: c.nome })),
    gruposDeUsuarios: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    setores: (setores.data ?? []).map((s) => ({ value: String(s.id), label: s.nome })),
    gruposDeLocais: (gruposDeLocais.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    permissoes: (permissoes.data ?? []).map((p) => ({
      canal: p.canal,
      grupoSiteId: p.grupo_site_id,
      grupoUsuarioId: p.grupo_usuario_id,
    })),
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
