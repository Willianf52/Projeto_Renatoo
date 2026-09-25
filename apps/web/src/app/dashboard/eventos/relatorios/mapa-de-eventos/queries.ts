import type { TipoDeGrafico } from "@/components/dashboard/GraficoPorDia";
import { periodoDoMes } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export const DIAS_DO_MES = 31;

/** Opcoes do "Tipo de Gráfico", as mesmas da referencia. Sem escolha, a tela
 * mostra so a grade. */
export const TIPOS_DE_GRAFICO: { value: TipoDeGrafico; label: string }[] = [
  { value: "barras", label: "Barras" },
  { value: "linhas", label: "Linhas" },
];

export type Filtros = {
  /**
   * "yyyy-mm", ou ausente enquanto ninguem escolheu. Sem preencher com o mes
   * atual de proposito: na referencia o campo abre vazio, mostrando
   * "Mês/Ano", e a grade so consulta depois da escolha -- um mes preenchido
   * sozinho parecia filtro que alguem aplicou.
   */
  mes?: string;
  evento?: string;
  tipoDeGrafico?: TipoDeGrafico;
  sites?: string;
  usuario?: string;
  /** "Atividades" -> `leituras.acao_id`, mesmo mapeamento dos relatorios de
   * Inspecoes (ver `Filtros.atividade` em registro-de-rondas/queries.ts). */
  atividade?: string;
  grupoSite?: string;
  grupoUsuario?: string;
};

function mesValido(valor: string | undefined): valor is string {
  if (!valor) return false;
  const encontrado = /^\d{4}-(\d{2})$/.exec(valor);
  if (!encontrado) return false;
  const mes = Number(encontrado[1]);
  return mes >= 1 && mes <= 12;
}

export function extrairFiltros(params: SearchParams): Filtros {
  const mes = primeiro(params.mes);
  const tipo = primeiro(params.tipo_grafico);
  return {
    mes: mesValido(mes) ? mes : undefined,
    evento: filtroDeId(primeiro(params.evento)),
    // Valor desconhecido na URL vira "sem grafico", nao um terceiro tipo.
    tipoDeGrafico: tipo === "barras" || tipo === "linhas" ? tipo : undefined,
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
    // "Grupo - Site", como no Registro de Eventos e no Mapa de Locais.
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

/** Uma linha de `relatorio_mapa_de_eventos` (migration 0056). */
export type LinhaDoBanco = {
  evento_id: number;
  evento_nome: string;
  dia: number;
  quantidade: number;
};

export type LinhaDoMapa = {
  eventoId: number;
  eventoNome: string;
  /** Indice 0 = dia 1. */
  porDia: number[];
  total: number;
};

export type MapaDeEventos = {
  linhas: LinhaDoMapa[];
  /** A linha "Total" do pe: soma de cada coluna de dia. */
  totaisPorDia: number[];
  totalGeral: number;
};

/**
 * Linhas do banco (Evento x dia) -> a grade da tela.
 *
 * So aparecem eventos com alguma ocorrencia no mes: diferente do Mapa de
 * Locais, que lista todo site para mostrar cobertura, aqui uma linha de zeros
 * nao diz nada -- e a lista de eventos cadastrados ja esta no filtro.
 *
 * Ordem alfabetica do evento em pt-BR, no Node e nao no banco (collation, ver
 * a 0049). Pura, para ser testada sem mockar o Supabase.
 */
export function montarMapa(doBanco: LinhaDoBanco[]): MapaDeEventos {
  const porEvento = new Map<number, LinhaDoMapa>();
  const totaisPorDia = Array.from({ length: DIAS_DO_MES }, () => 0);

  for (const linha of doBanco) {
    let doMapa = porEvento.get(linha.evento_id);
    if (!doMapa) {
      doMapa = {
        eventoId: linha.evento_id,
        eventoNome: linha.evento_nome,
        porDia: Array.from({ length: DIAS_DO_MES }, () => 0),
        total: 0,
      };
      porEvento.set(linha.evento_id, doMapa);
    }
    doMapa.porDia[linha.dia - 1] += linha.quantidade;
    doMapa.total += linha.quantidade;
    totaisPorDia[linha.dia - 1] += linha.quantidade;
  }

  const linhas = Array.from(porEvento.values()).sort((a, b) =>
    a.eventoNome.localeCompare(b.eventoNome, "pt-BR"),
  );

  return { linhas, totaisPorDia, totalGeral: totaisPorDia.reduce((soma, n) => soma + n, 0) };
}

/** `null` enquanto nao ha Mês/Ano escolhido: nada a consultar ainda. */
export async function getMapaDeEventos(filtros: Filtros): Promise<MapaDeEventos | null> {
  if (!filtros.mes) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoDoMes(filtros.mes);

  const p_filtros = filtrosParaRpc({
    evento: filtros.evento,
    site: filtros.sites,
    funcionario: filtros.usuario,
    atividade: filtros.atividade,
    grupo_site: filtros.grupoSite,
    grupo_usuario: filtros.grupoUsuario,
  });

  // Paginado mesmo sendo agregado: sao ate eventos x 31 linhas, e o
  // PostgREST corta em `max_rows` (1000) sem avisar. Ordenacao estavel, que
  // `buscarEmPaginas` exige.
  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_mapa_de_eventos", { p_inicio: inicio, p_fim: fim, p_filtros })
      .order("evento_id", { ascending: true })
      .order("dia", { ascending: true })
      .range(de, ate),
  );

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Mapa de Eventos: teto de agregação atingido; o mês exibido está incompleto.");
  }

  return montarMapa(linhas);
}

/** Dia sem ocorrencia fica vazio, e nao "0": numa grade de 31 colunas o zero
 * repetido esconde os dias que tiveram algo. */
function celula(n: number): string {
  return n > 0 ? String(n) : "";
}

export const TABLE_COLUMNS = [
  "Eventos",
  ...Array.from({ length: DIAS_DO_MES }, (_, i) => String(i + 1)),
  "TOTAL",
];

/** Colunas de texto para Excel/PDF. */
export function paraLinhasDeExportacao(mapa: MapaDeEventos): string[][] {
  return mapa.linhas.map((linha) => [linha.eventoNome, ...linha.porDia.map(celula), String(linha.total)]);
}

/** A linha "Total" do pe, nas colunas da exportacao. */
export function linhaDeTotal(mapa: MapaDeEventos): string[] {
  return ["Total", ...mapa.totaisPorDia.map(celula), String(mapa.totalGeral)];
}
