import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { STATUS, type Status } from "../../painel-de-eventos/queries";
import { CORES_DOS_EVENTOS } from "../graficos-de-eventos/queries";

/**
 * Graficos por Classificacao (issue #209). Na referencia ("Gráfico de
 * Classificação por Eventos") sao dois graficos de colunas: "Eventos", uma
 * coluna por classificacao com a tabela "Visão Geral | Total", e "Eventos por
 * Usuários". La a tela sai vazia em qualquer periodo -- ninguem classificou
 * ocorrencia --, entao o desenho dos dados segue o da tela, e nao um exemplo.
 *
 * A classificacao de uma ocorrencia e a do andamento mais recente que tem uma
 * (0064): a analise pode reclassificar. Sem nenhuma, vale a escolhida no
 * Registrar Evento (0072). Ocorrencia nunca classificada nao entra, como na
 * referencia.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  sites?: string;
  evento?: string;
  usuario?: string;
  status?: Status;
};

export function extrairFiltros(params: SearchParams): Filtros {
  const status = primeiro(params.status);
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    sites: filtroDeId(primeiro(params.sites)),
    evento: filtroDeId(primeiro(params.evento)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
    status: STATUS.some((s) => s.value === status) ? (status as Status) : undefined,
  };
}

export type Opcao = { value: string; label: string };
export type OpcoesFiltros = { sites: Opcao[]; eventos: Opcao[]; usuarios: Opcao[]; status: Opcao[] };

/** Sem cache: `sites` e `profiles` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();
  const [sites, eventos, usuarios] = await Promise.all([
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    eventos: (eventos.data ?? []).map((e) => ({ value: String(e.id), label: e.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: String(u.id), label: u.nome_completo ?? "" })),
    status: STATUS.map((s) => ({ value: s.value, label: s.label })),
  };
}

type TipoDoBanco = { nome: string; cor: string | null } | null;

export type OcorrenciaDoBanco = {
  autor: { nome_completo: string | null } | null;
  /** A do Registrar Evento (0072); nula nas que vem do checklist. */
  classificacao_id?: number | null;
  tipos_de_classificacao?: TipoDoBanco;
  ocorrencia_andamentos: {
    id: number;
    classificacao_id: number | null;
    tipos_de_classificacao: TipoDoBanco;
  }[];
};

export type ClassificacaoAgregada = { id: number; nome: string; cor: string; quantidade: number };
export type UsuarioAgregado = { nome: string; total: number; porClassificacao: Map<number, number> };
export type GraficosPorClassificacao = {
  classificacoes: ClassificacaoAgregada[];
  usuarios: UsuarioAgregado[];
  total: number;
};

/**
 * Pura. Classificacoes em ordem alfabetica; usuarios do que mais tem para o
 * que menos tem. Tipo sem cor cadastrada (os anteriores a 0071) pega a cor da
 * paleta dos Graficos de Eventos pela posicao.
 */
export function agrupar(ocorrencias: OcorrenciaDoBanco[]): GraficosPorClassificacao {
  const classificacoes = new Map<number, Omit<ClassificacaoAgregada, "cor"> & { cor: string | null }>();
  const usuarios = new Map<string, UsuarioAgregado>();
  let total = 0;

  for (const o of ocorrencias) {
    const daAnalise = o.ocorrencia_andamentos
      .filter((a) => a.classificacao_id !== null)
      .reduce<OcorrenciaDoBanco["ocorrencia_andamentos"][number] | null>(
        (maisRecente, a) => (maisRecente === null || a.id > maisRecente.id ? a : maisRecente),
        null,
      );
    const atual =
      daAnalise ??
      (o.classificacao_id != null
        ? { classificacao_id: o.classificacao_id, tipos_de_classificacao: o.tipos_de_classificacao ?? null }
        : null);
    if (!atual || atual.classificacao_id === null) continue;

    const id = atual.classificacao_id;
    const existente = classificacoes.get(id);
    if (existente) existente.quantidade += 1;
    else
      classificacoes.set(id, {
        id,
        // Sem leitura do tipo (so a gestao le os tipos, 0064), sobra o numero.
        nome: atual.tipos_de_classificacao?.nome ?? `Classificação ${id}`,
        cor: atual.tipos_de_classificacao?.cor ?? null,
        quantidade: 1,
      });

    const nome = o.autor?.nome_completo ?? "";
    const usuario = usuarios.get(nome) ?? { nome, total: 0, porClassificacao: new Map<number, number>() };
    usuario.total += 1;
    usuario.porClassificacao.set(id, (usuario.porClassificacao.get(id) ?? 0) + 1);
    usuarios.set(nome, usuario);
    total += 1;
  }

  const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return {
    classificacoes: [...classificacoes.values()]
      .sort((a, b) => comparar(a.nome, b.nome))
      .map((c, i) => ({ ...c, cor: c.cor ?? CORES_DOS_EVENTOS[i % CORES_DOS_EVENTOS.length] })),
    usuarios: [...usuarios.values()].sort((a, b) => b.total - a.total || comparar(a.nome, b.nome)),
    total,
  };
}

/** Grafico "Eventos": uma serie por classificacao, cada uma so com a propria
 * coluna -- assim cada coluna sai na cor do tipo e a legenda da o nome. */
export function seriesPorClassificacao(g: GraficosPorClassificacao) {
  return g.classificacoes.map((c, i) => ({
    nome: c.nome,
    cor: c.cor,
    valores: g.classificacoes.map((_, j) => (j === i ? c.quantidade : 0)),
  }));
}

/** Grafico "Eventos por Usuários": uma coluna por usuario, empilhada pelas
 * classificacoes. */
export function seriesPorUsuario(g: GraficosPorClassificacao) {
  return g.classificacoes.map((c) => ({
    nome: c.nome,
    cor: c.cor,
    valores: g.usuarios.map((u) => u.porClassificacao.get(c.id) ?? 0),
  }));
}

/** `null` enquanto o periodo nao esta completo, como as demais telas de
 * Eventos. Paginado porque o PostgREST corta em 1000 sem avisar. */
export async function getGraficosPorClassificacao(filtros: Filtros): Promise<GraficosPorClassificacao | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const { linhas, atingiuTeto } = await buscarEmPaginas<OcorrenciaDoBanco>((de, ate) => {
    let q = supabase
      .from("ocorrencias")
      .select(
        `id, classificacao_id, tipos_de_classificacao ( nome, cor ),
         autor:profiles!ocorrencias_aberta_por_fkey ( nome_completo ),
         ocorrencia_andamentos ( id, classificacao_id, tipos_de_classificacao ( nome, cor ) )`,
      )
      .gte("criado_em", inicio)
      .lt("criado_em", fim);
    if (filtros.sites) q = q.eq("site_id", Number(filtros.sites));
    if (filtros.evento) q = q.eq("evento_id", Number(filtros.evento));
    if (filtros.usuario) q = q.eq("aberta_por", filtros.usuario);
    if (filtros.status) q = q.eq("status", filtros.status);
    return q.order("id", { ascending: true }).range(de, ate);
  });

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Gráficos por Classificação: teto de agregação atingido; o período está incompleto.");
  }

  return agrupar(linhas);
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
