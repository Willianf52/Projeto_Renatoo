import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc, montarSeriesDeStatus } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Filtros da tela de referencia. "Status" e "Checklists" nao entram: o
 * schema nao guarda situacao de tratativa nem checklist ligado a evento --
 * ver os comentarios dos campos em page.tsx.
 */
export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  evento?: string;
  sites?: string;
  usuario?: string;
  /** "Atividades" -> `leituras.acao_id`, como nos demais relatorios. */
  atividade?: string;
  grupoSite?: string;
  grupoUsuario?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    evento: filtroDeId(primeiro(params.evento)),
    sites: filtroDeId(primeiro(params.sites)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
    atividade: filtroDeId(primeiro(params.atividade)),
    grupoSite: filtroDeId(primeiro(params.grupo_site)),
    grupoUsuario: filtroDeId(primeiro(params.grupo_usuario)),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  eventos: Opcao[];
  sites: Opcao[];
  usuarios: Opcao[];
  atividades: Opcao[];
  gruposSites: Opcao[];
  gruposUsuarios: Opcao[];
};

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

function paraOpcoes(linhas: { id: number | string; nome: string | null }[] | null): Opcao[] {
  return (linhas ?? []).map((linha) => ({ value: String(linha.id), label: linha.nome ?? "" }));
}

/** Sem cache manual, pelo mesmo motivo dos demais relatorios: `sites`,
 * `profiles` e `grupos_usuarios` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [eventos, sites, usuarios, atividades, gruposSites, gruposUsuarios] = await Promise.all([
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
    supabase.from("acoes").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
  ]);

  return {
    eventos: paraOpcoes(eventos.data),
    // "Grupo - Site", como nas demais telas de Eventos.
    sites: ((sites.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    usuarios: paraOpcoes((usuarios.data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo }))),
    atividades: paraOpcoes(atividades.data),
    gruposSites: paraOpcoes(gruposSites.data),
    gruposUsuarios: paraOpcoes(gruposUsuarios.data),
  };
}

/**
 * Uma linha de `relatorio_registro_de_eventos` (0055, reescrita na 0056):
 * Site x Evento com a quantidade. Esta tela ignora o site e soma por evento --
 * sem migration nova, a mesma funcao do Eventos por Site.
 */
export type LinhaDoBanco = {
  site_id: number;
  site_nome: string;
  grupo_site_nome: string | null;
  evento_id: number;
  evento_nome: string;
  quantidade: number;
};

export type EventoAgregado = { eventoId: number; eventoNome: string; quantidade: number };

export type GraficosDeEventos = {
  eventos: EventoAgregado[];
  /** "Total de Eventos" do cabecalho da referencia. */
  total: number;
};

/**
 * Linhas Site x Evento -> um item por evento, com a soma.
 *
 * Ordenado por `evento_id`, NAO pela quantidade: e como a referencia desenha
 * (no print, RH tem 24 e aparece em setimo), e mantem a cor de cada fatia
 * presa ao evento em vez de ao tamanho dele -- filtrar um periodo diferente
 * nao repinta os que sobraram.
 *
 * Pura, para ser testada sem mockar o Supabase.
 */
export function agruparPorEvento(doBanco: LinhaDoBanco[]): GraficosDeEventos {
  const porEvento = new Map<number, EventoAgregado>();

  for (const linha of doBanco) {
    const evento = porEvento.get(linha.evento_id);
    if (evento) {
      evento.quantidade += linha.quantidade;
    } else {
      porEvento.set(linha.evento_id, {
        eventoId: linha.evento_id,
        eventoNome: linha.evento_nome,
        quantidade: linha.quantidade,
      });
    }
  }

  const eventos = Array.from(porEvento.values()).sort((a, b) => a.eventoId - b.eventoId);
  return { eventos, total: eventos.reduce((soma, evento) => soma + evento.quantidade, 0) };
}

/**
 * Cores das fatias: a paleta categorica validada para fundo escuro (contraste
 * >= 3:1 sobre `--color-brand-surface`, e separacao suficiente entre vizinhas
 * para daltonismo). A referencia usa a paleta do Highcharts, que nao vem
 * junto quando se desenha o SVG na mao.
 */
export const CORES_DOS_EVENTOS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

/** Cinza de apoio: nao e uma categoria, e o resto somado. */
const COR_DE_OUTROS = "#64748b";
const ROTULO_DE_OUTROS = "Outros";

/**
 * Quantas fatias ganham cor propria. E o tamanho da paleta: a nona fatia nao
 * ganha uma cor inventada (duas fatias parecidas viram a mesma coisa aos
 * olhos), entra em "Outros". Nada some da tela -- o grafico de colunas
 * embaixo lista TODOS os eventos, um por coluna, como na referencia.
 */
const MAXIMO_DE_FATIAS = CORES_DOS_EVENTOS.length;

export type Fatia = { rotulo: string; valor: number; cor: string };

/**
 * Fatias da pizza, na ordem do catalogo. Quando ha mais eventos que cores, os
 * MENORES viram uma fatia "Outros" no fim.
 */
export function fatiasDaPizza(eventos: EventoAgregado[]): Fatia[] {
  if (eventos.length <= MAXIMO_DE_FATIAS) {
    return eventos.map((evento, i) => ({
      rotulo: evento.eventoNome,
      valor: evento.quantidade,
      cor: CORES_DOS_EVENTOS[i],
    }));
  }

  // Quais ficam: os maiores. A ORDEM continua a do catalogo -- o corte usa a
  // quantidade, o desenho nao.
  const maiores = [...eventos]
    .sort((a, b) => b.quantidade - a.quantidade || a.eventoId - b.eventoId)
    .slice(0, MAXIMO_DE_FATIAS);
  const ficam = new Set(maiores.map((evento) => evento.eventoId));

  const fatias = eventos
    .filter((evento) => ficam.has(evento.eventoId))
    .map((evento, i) => ({ rotulo: evento.eventoNome, valor: evento.quantidade, cor: CORES_DOS_EVENTOS[i] }));

  const resto = eventos
    .filter((evento) => !ficam.has(evento.eventoId))
    .reduce((soma, evento) => soma + evento.quantidade, 0);

  return resto > 0 ? [...fatias, { rotulo: ROTULO_DE_OUTROS, valor: resto, cor: COR_DE_OUTROS }] : fatias;
}

/** Uma serie por status, um valor por evento -- ver `montarSeriesDeStatus`. */
export function montarSeries(eventos: EventoAgregado[]) {
  return montarSeriesDeStatus(eventos.map((evento) => evento.quantidade));
}

/** Colunas e linhas do CSV do menu do grafico: um evento por linha, uma
 * coluna por status, o total e a fatia que ele ocupa na pizza. */
export function paraPlanilha(
  eventos: EventoAgregado[],
  total: number,
): { colunas: string[]; linhas: string[][] } {
  const series = montarSeries(eventos);
  return {
    colunas: ["Evento", ...series.map((serie) => serie.nome), "Total", "Percentual"],
    linhas: eventos.map((evento, i) => [
      evento.eventoNome,
      ...series.map((serie) => String(serie.valores[i])),
      String(evento.quantidade),
      `${total > 0 ? ((evento.quantidade / total) * 100).toFixed(1) : "0.0"}%`,
    ]),
  };
}

/** `null` enquanto o periodo nao esta completo: a tela nao consulta sem as
 * duas datas, como as demais telas de Eventos. */
export async function getGraficosDeEventos(filtros: Filtros): Promise<GraficosDeEventos | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const p_filtros = filtrosParaRpc({
    evento: filtros.evento,
    site: filtros.sites,
    funcionario: filtros.usuario,
    atividade: filtros.atividade,
    grupo_site: filtros.grupoSite,
    grupo_usuario: filtros.grupoUsuario,
  });

  // Paginado: sao ate sites x eventos linhas, e o PostgREST corta em
  // `max_rows` sem avisar. Ordenacao estavel, que `buscarEmPaginas` exige.
  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_registro_de_eventos", {
        p_inicio: inicio,
        p_fim: fim,
        p_por_data_insercao: false,
        p_filtros,
      })
      .order("site_id", { ascending: true })
      .order("evento_id", { ascending: true })
      .range(de, ate),
  );

  if (atingiuTeto) {
    erro(
      gerarIdDeRequisicao(),
      "Gráficos de Eventos: teto de agregação atingido; o período exibido está incompleto.",
    );
  }

  return agruparPorEvento(linhas);
}

/** "yyyy-mm-dd" -> "dd/mm/aaaa", para o subtitulo "01/09/2026 até 18/09/2026". */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
