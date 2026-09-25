import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { niveisDoSite } from "@/lib/hierarquia-de-sites";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc, montarSeriesDeStatus, STATUS_DO_GRAFICO } from "@/lib/relatorios";
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
 * Site x Evento com a quantidade. E o mesmo recorte que esta tela precisa --
 * sem migration nova. Aqui chamada pela DATA DO EVENTO, como os mapas: a
 * tela nao tem o seletor de "Data de Inserção" do Registro.
 */
export type LinhaDoBanco = {
  site_id: number;
  site_nome: string;
  grupo_site_nome: string | null;
  evento_id: number;
  evento_nome: string;
  quantidade: number;
};

export type EventoDoSite = { eventoId: number; eventoNome: string; quantidade: number };

export type SiteComEventos = {
  siteId: number;
  siteNome: string;
  /** "UP Serviços" > grupo > site, como no Registro de Eventos. */
  siteNiveis: string[];
  total: number;
  /** Quebra por evento, maior primeiro. */
  eventos: EventoDoSite[];
};

export type EventosPorSite = {
  sites: SiteComEventos[];
  /** "Total de Eventos" do cabecalho da referencia. */
  total: number;
};

/**
 * Linhas Site x Evento -> um item por site, com o total e a quebra por
 * evento. Maior total primeiro (desempate pela hierarquia do site em pt-BR),
 * que e a ordem natural de um grafico de "quem teve mais".
 *
 * Pura, para ser testada sem mockar o Supabase.
 */
export function agruparPorSite(doBanco: LinhaDoBanco[]): EventosPorSite {
  const porSite = new Map<number, SiteComEventos>();

  for (const linha of doBanco) {
    let site = porSite.get(linha.site_id);
    if (!site) {
      site = {
        siteId: linha.site_id,
        siteNome: linha.site_nome,
        siteNiveis: niveisDoSite(linha.grupo_site_nome, linha.site_nome),
        total: 0,
        eventos: [],
      };
      porSite.set(linha.site_id, site);
    }
    site.total += linha.quantidade;
    site.eventos.push({ eventoId: linha.evento_id, eventoNome: linha.evento_nome, quantidade: linha.quantidade });
  }

  const sites = Array.from(porSite.values());
  for (const site of sites) {
    site.eventos.sort(
      (a, b) => b.quantidade - a.quantidade || a.eventoNome.localeCompare(b.eventoNome, "pt-BR"),
    );
  }
  sites.sort(
    (a, b) =>
      b.total - a.total || a.siteNiveis.join(" > ").localeCompare(b.siteNiveis.join(" > "), "pt-BR"),
  );

  return { sites, total: sites.reduce((soma, site) => soma + site.total, 0) };
}

/** `null` enquanto o periodo nao esta completo: a tela nao consulta sem as
 * duas datas, como Registro de Eventos e Mapa de Eventos por Site. */
export async function getEventosPorSite(filtros: Filtros): Promise<EventosPorSite | null> {
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
    erro(gerarIdDeRequisicao(), "Eventos por Site: teto de agregação atingido; o período exibido está incompleto.");
  }

  return agruparPorSite(linhas);
}

/** "yyyy-mm-dd" -> "dd/mm/aaaa", para o subtitulo "01/09/2026 até 18/09/2026". */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** A legenda mora em `lib/relatorios`: Graficos de Eventos desenha a mesma.
 * Re-exportada para nao quebrar quem ja importava daqui. */
export { STATUS_DO_GRAFICO };

/** Uma serie por status, um valor por site -- ver `montarSeriesDeStatus`. */
export function montarSeries(sites: SiteComEventos[]) {
  return montarSeriesDeStatus(sites.map((site) => site.total));
}

/** Colunas e linhas do CSV do menu do grafico: um site por linha, uma coluna
 * por status e o total. */
export function paraPlanilha(sites: SiteComEventos[]): { colunas: string[]; linhas: string[][] } {
  const series = montarSeries(sites);
  return {
    colunas: ["Site", ...series.map((serie) => serie.nome), "Total"],
    linhas: sites.map((site, i) => [
      site.siteNiveis.join(" > "),
      ...series.map((serie) => String(serie.valores[i])),
      String(site.total),
    ]),
  };
}
