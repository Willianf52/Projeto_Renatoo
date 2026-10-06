import { periodoEntreDatas } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import {
  extrairFiltros as extrairFiltrosBase,
  formatarData,
  getOpcoesFiltros,
  primeiro,
  type Filtros as FiltrosBase,
  type Opcao,
  type OpcoesFiltros,
  type SearchParams,
} from "../graficos-de-eventos/queries";

/**
 * Tempo Medio de Resolucao das Nao Conformidades (item 5 da #164, segunda
 * metade), como o `vlab_rel_tempo_medio.php` do sistema de referencia:
 * colunas por TIPO DE EVENTO com o tempo medio entre a abertura da ocorrencia
 * e a finalizacao, o seletor Dias/Horas trocando a unidade, e a tabela
 * "Evento | Qtd Dias | Tempo Total" (lida na referencia em 06/10/2026).
 *
 * SO OCORRENCIA FINALIZADA ENTRA. Na referencia o relatorio veio vazio com
 * 787 ocorrencias em "Aguardando" e nenhuma encerrada -- ocorrencia em aberto
 * nao conta como "tempo de resolucao". Aqui: `finalizada_em` preenchido (0064).
 *
 * O periodo recorta pela ABERTURA (`criado_em`), como o Registro de Eventos e
 * o Ranking: o mesmo filtro de datas mostra as mesmas ocorrencias nas telas.
 */
export { formatarData, getOpcoesFiltros, primeiro };
export type { Opcao, OpcoesFiltros, SearchParams };

export type Formato = "dias" | "horas";

/** Os cinco status da referencia, na ordem do select de la. */
export const OPCOES_DE_STATUS: Opcao[] = [
  { value: "AGUARDANDO", label: "Aguardando" },
  { value: "EM_ANALISE", label: "Em Análise" },
  { value: "ATENDIDO", label: "Atendido" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CRITICO", label: "Crítico" },
];

export const OPCOES_DE_FORMATO: Opcao[] = [
  { value: "dias", label: "Dias" },
  { value: "horas", label: "Horas" },
];

export type Filtros = FiltrosBase & { status?: string; formato: Formato };

export function extrairFiltros(params: SearchParams): Filtros {
  const status = primeiro(params.status);
  return {
    ...extrairFiltrosBase(params),
    status: OPCOES_DE_STATUS.some((o) => o.value === status) ? status : undefined,
    formato: primeiro(params.formato) === "horas" ? "horas" : "dias",
  };
}

/** Uma ocorrencia finalizada, como vem do banco. */
export type OcorrenciaFinalizada = {
  evento_id: number;
  criado_em: string;
  finalizada_em: string;
  eventos: { nome: string } | null;
};

export type ItemDoTempoMedio = {
  eventoId: number;
  eventoNome: string;
  /** Ocorrencias finalizadas do tipo no periodo. */
  quantidade: number;
  /** Media na unidade escolhida, com duas casas (a dica da referencia usa `.2f`). */
  media: number;
  /** Soma das duracoes, em milissegundos. */
  totalMs: number;
};

const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/**
 * Ocorrencias finalizadas -> um item por tipo de evento, da maior media para a
 * menor (empate no nome e no id, para a ordem nao depender do banco).
 *
 * Duracao negativa (relogio fora de ordem) conta como zero: nao existe
 * resolucao antes da abertura, e um negativo puxaria a media para baixo.
 */
export function montarTempoMedio(linhas: OcorrenciaFinalizada[], formato: Formato): ItemDoTempoMedio[] {
  const porEvento = new Map<number, { eventoNome: string; quantidade: number; totalMs: number }>();

  for (const linha of linhas) {
    const duracao = Math.max(0, Date.parse(linha.finalizada_em) - Date.parse(linha.criado_em));
    if (Number.isNaN(duracao)) continue;

    const atual = porEvento.get(linha.evento_id);
    if (atual) {
      atual.quantidade += 1;
      atual.totalMs += duracao;
    } else {
      porEvento.set(linha.evento_id, {
        eventoNome: linha.eventos?.nome ?? `Evento ${linha.evento_id}`,
        quantidade: 1,
        totalMs: duracao,
      });
    }
  }

  const divisor = formato === "horas" ? MS_POR_HORA : MS_POR_DIA;

  return Array.from(porEvento, ([eventoId, item]) => ({
    eventoId,
    eventoNome: item.eventoNome,
    quantidade: item.quantidade,
    media: Math.round((item.totalMs / item.quantidade / divisor) * 100) / 100,
    totalMs: item.totalMs,
  })).sort(
    (a, b) => b.media - a.media || a.eventoNome.localeCompare(b.eventoNome, "pt-BR") || a.eventoId - b.eventoId,
  );
}

/** "2d 03h 15min" -- o Tempo Total da tabela, legivel em qualquer unidade. */
export function formatarDuracao(ms: number): string {
  const minutosTotais = Math.round(Math.max(0, ms) / 60_000);
  const dias = Math.floor(minutosTotais / (24 * 60));
  const horas = Math.floor((minutosTotais % (24 * 60)) / 60);
  const minutos = minutosTotais % 60;
  return `${dias}d ${String(horas).padStart(2, "0")}h ${String(minutos).padStart(2, "0")}min`;
}

/** Media com virgula e duas casas: 2,50. */
export function formatarMedia(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** `null` enquanto o periodo nao esta completo, como as demais telas. */
export async function getTempoMedio(filtros: Filtros): Promise<ItemDoTempoMedio[] | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  // "Grupos Usuarios" recorta por quem ABRIU a ocorrencia (o inspetor), como o
  // filtro "Usuarios". Grupo sem membros = nenhuma ocorrencia, nao "todas".
  let membros: string[] | null = null;
  if (filtros.grupoUsuario) {
    const { data, error } = await supabase
      .from("grupos_usuarios_membros")
      .select("profile_id")
      .eq("grupo_id", Number(filtros.grupoUsuario));
    if (error) throw error;
    membros = (data ?? []).map((m) => m.profile_id);
    if (membros.length === 0) return [];
  }

  const { linhas, atingiuTeto } = await buscarEmPaginas<OcorrenciaFinalizada>((de, ate) => {
    let consulta = supabase
      .from("ocorrencias")
      .select("evento_id, criado_em, finalizada_em, eventos ( nome ), sites!inner ( grupo_site_id )")
      .not("finalizada_em", "is", null)
      .gte("criado_em", inicio)
      .lt("criado_em", fim);

    if (filtros.evento) consulta = consulta.eq("evento_id", Number(filtros.evento));
    if (filtros.sites) consulta = consulta.eq("site_id", Number(filtros.sites));
    if (filtros.usuario) consulta = consulta.eq("aberta_por", filtros.usuario);
    if (filtros.status) consulta = consulta.eq("status", filtros.status);
    if (filtros.grupoSite) consulta = consulta.eq("sites.grupo_site_id", Number(filtros.grupoSite));
    if (membros) consulta = consulta.in("aberta_por", membros);

    return consulta.order("id", { ascending: true }).range(de, ate);
  });

  if (atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      "Tempo Médio de Resolução: teto de agregação atingido; o período exibido está incompleto.",
    );
  }

  return montarTempoMedio(linhas, filtros.formato);
}

/** Colunas e linhas do CSV do menu do grafico -- as da tabela da referencia. */
export function paraPlanilha(itens: ItemDoTempoMedio[], formato: Formato): { colunas: string[]; linhas: string[][] } {
  return {
    colunas: ["Evento", formato === "horas" ? "Qtd Horas" : "Qtd Dias", "Tempo Total"],
    linhas: itens.map((item) => [item.eventoNome, formatarMedia(item.media), formatarDuracao(item.totalMs)]),
  };
}
