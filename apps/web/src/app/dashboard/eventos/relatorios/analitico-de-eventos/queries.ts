import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { niveisDoSite } from "@/lib/hierarquia-de-sites";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

/**
 * Analitico de Eventos (issue #209, menu Eventos > Relatorios do GESTOR na
 * referencia). Uma linha por dia x local x usuario x evento, com a quantidade
 * e ha quanto tempo aquele dia passou.
 *
 * A fonte sao as OCORRENCIAS (0063), e nao as `leituras` do Registro de
 * Eventos: os nomes que a referencia lista (Portaria, Uniforme, RH...) sao os
 * tipos de evento das perguntas do checklist, e no banco novo nenhuma leitura
 * tem evento -- so as ocorrencias abertas pelo checklist.
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
  grupoUsuario?: string;
  usuario?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    sites: filtroDeId(primeiro(params.sites)),
    evento: filtroDeId(primeiro(params.evento)),
    grupoUsuario: filtroDeId(primeiro(params.grupo_usuario)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
  };
}

export type Opcao = { value: string; label: string };
export type OpcoesFiltros = { sites: Opcao[]; eventos: Opcao[]; grupos: Opcao[]; usuarios: Opcao[] };

/** Sem cache: `sites` e `profiles` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();
  const [sites, eventos, grupos, usuarios] = await Promise.all([
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    sites: ((sites.data ?? []) as unknown as { id: number; nome: string; grupos_sites: { nome: string } | null }[]).map(
      (s) => ({ value: String(s.id), label: s.grupos_sites?.nome ? `${s.grupos_sites.nome} - ${s.nome}` : s.nome }),
    ),
    eventos: (eventos.data ?? []).map((e) => ({ value: String(e.id), label: e.nome })),
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: String(u.id), label: u.nome_completo ?? "" })),
  };
}

// --- Duracao -------------------------------------------------------------------

/** Brasilia, sem horario de verao desde 2019 -- o mesmo deslocamento fixo de
 * `lib/data-hora.ts`. */
const DESLOCAMENTO_MS = 3 * 60 * 60 * 1000;

/** "yyyy-mm-dd" do dia em Brasilia de um carimbo do banco. */
export function diaEmBrasilia(carimbo: string): string {
  return new Date(new Date(carimbo).getTime() - DESLOCAMENTO_MS).toISOString().slice(0, 10);
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export type Duracao = { meses: number; dias: number; horas: number; minutos: number; totalDeHoras: number };

/**
 * Da meia-noite do `dia` (Brasilia) ate `agora`, como a referencia calcula:
 * todas as linhas de um mesmo dia tem a mesma duracao, e ela segue correndo
 * mesmo com a ocorrencia ja finalizada (conferido em 15/10 com um periodo de
 * agosto). Meses de calendario, com o emprestimo de dias feito pelo mes de
 * partida -- 31/08 ate 15/10 da "1 mes e 15 dias" la, e aqui tambem.
 */
export function duracaoDesde(dia: string, agora: Date): Duracao {
  const [anoD, mesD, diaD] = dia.split("-").map(Number);
  const inicio = Date.UTC(anoD, mesD - 1, diaD) + DESLOCAMENTO_MS;
  const totalDeMinutos = Math.max(0, Math.floor((agora.getTime() - inicio) / 60_000));
  if (totalDeMinutos === 0) return { meses: 0, dias: 0, horas: 0, minutos: 0, totalDeHoras: 0 };

  const local = new Date(agora.getTime() - DESLOCAMENTO_MS);
  let meses = (local.getUTCFullYear() - anoD) * 12 + (local.getUTCMonth() + 1 - mesD);
  let dias = local.getUTCDate() - diaD;
  if (dias < 0) {
    meses -= 1;
    dias += diasNoMes(anoD, mesD);
  }

  return {
    meses,
    dias,
    horas: local.getUTCHours(),
    minutos: local.getUTCMinutes(),
    totalDeHoras: Math.floor(totalDeMinutos / 60),
  };
}

function quantos(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "2 meses, 12 dias, 17 horas e 36 minutos". Meses e dias zerados somem; horas
 * e minutos ficam sempre, como na referencia. */
export function formatarDuracao(d: Duracao): string {
  const partes = [
    ...(d.meses > 0 ? [quantos(d.meses, "mês", "meses")] : []),
    ...(d.dias > 0 ? [quantos(d.dias, "dia", "dias")] : []),
    quantos(d.horas, "hora", "horas"),
    quantos(d.minutos, "minuto", "minutos"),
  ];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

// --- Agrupamento ---------------------------------------------------------------

export type OcorrenciaDoBanco = {
  criado_em: string;
  site_id: number;
  sites: { nome: string; grupos_sites: { nome: string } | null } | null;
  eventos: { nome: string } | null;
  autor: { nome_completo: string | null } | null;
};

export type LinhaDoAnalitico = {
  dia: string;
  siteNiveis: string[];
  usuario: string;
  duracao: string;
  horas: number;
  evento: string;
  quantidade: number;
};

/** Pura: agrupa por dia x local x usuario x evento e ordena por dia, local,
 * usuario e evento. `agora` injetavel para o teste. */
export function montarLinhas(ocorrencias: OcorrenciaDoBanco[], agora: Date): LinhaDoAnalitico[] {
  const grupos = new Map<string, LinhaDoAnalitico>();

  for (const o of ocorrencias) {
    const dia = diaEmBrasilia(o.criado_em);
    const usuario = o.autor?.nome_completo ?? "";
    const evento = o.eventos?.nome ?? "";
    const chave = [dia, o.site_id, usuario, evento].join("\u0000");
    const existente = grupos.get(chave);
    if (existente) {
      existente.quantidade += 1;
      continue;
    }
    const duracao = duracaoDesde(dia, agora);
    grupos.set(chave, {
      dia,
      siteNiveis: niveisDoSite(o.sites?.grupos_sites?.nome, o.sites?.nome ?? ""),
      usuario,
      duracao: formatarDuracao(duracao),
      horas: duracao.totalDeHoras,
      evento,
      quantidade: 1,
    });
  }

  const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return [...grupos.values()].sort(
    (a, b) =>
      comparar(a.dia, b.dia) ||
      comparar(a.siteNiveis.join(" "), b.siteNiveis.join(" ")) ||
      comparar(a.usuario, b.usuario) ||
      comparar(a.evento, b.evento),
  );
}

/**
 * Sem periodo, nada: a tela pede Data Inicial e Final antes de consultar,
 * como Registro de Eventos -- sem limite inferior a consulta varreria
 * `ocorrencias` inteira. Paginado porque o PostgREST corta em 1000 sem avisar.
 */
export async function getAnalitico(filtros: Filtros, agora: Date): Promise<LinhaDoAnalitico[] | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);
  // `!inner` no autor so quando o filtro e por grupo de usuarios: o embed dos
  // membros recorta a ocorrencia pelo grupo de quem a abriu, o mesmo caminho
  // do Historico de Checklist.
  const autor = filtros.grupoUsuario
    ? "autor:profiles!ocorrencias_aberta_por_fkey!inner ( nome_completo, grupos_usuarios_membros!inner ( grupo_id ) )"
    : "autor:profiles!ocorrencias_aberta_por_fkey ( nome_completo )";

  const { linhas, atingiuTeto } = await buscarEmPaginas<OcorrenciaDoBanco>((de, ate) => {
    let q = supabase
      .from("ocorrencias")
      .select(`id, criado_em, site_id, sites!inner ( nome, grupos_sites ( nome ) ), eventos!ocorrencias_evento_id_fkey ( nome ), ${autor}`)
      .gte("criado_em", inicio)
      .lt("criado_em", fim);
    if (filtros.sites) q = q.eq("site_id", Number(filtros.sites));
    if (filtros.evento) q = q.eq("evento_id", Number(filtros.evento));
    if (filtros.usuario) q = q.eq("aberta_por", filtros.usuario);
    if (filtros.grupoUsuario) q = q.eq("autor.grupos_usuarios_membros.grupo_id", Number(filtros.grupoUsuario));
    return q.order("id", { ascending: true }).range(de, ate);
  });

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Analítico de Eventos: teto de agregação atingido; o período exibido está incompleto.");
  }

  return montarLinhas(linhas, agora);
}

/** "dd/mm/aaaa" de um "yyyy-mm-dd". */
export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

export const TABLE_COLUMNS = ["Data", "Local", "Usuários", "Duração", "Duração em horas", "Evento", "Qtd"];

export function paraLinhasDeExportacao(linhas: LinhaDoAnalitico[]): string[][] {
  return linhas.map((l) => [
    formatarDia(l.dia),
    l.siteNiveis.join(" > "),
    l.usuario,
    l.duracao,
    `${l.horas} horas`,
    l.evento,
    String(l.quantidade),
  ]);
}
