import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc, periodoInvertido } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  coletorDados?: string;
  funcionario?: string;
  checkpoint?: string;
  /**
   * "Sites" e "Local" sao dois campos separados na tela de referencia, mas
   * ambos resolvem para `sites.id` -- "Sites" so exibe as opcoes agrupadas
   * por Grupo de Sites (rotulo "Grupo - Site"), "Local" exibe o nome puro.
   * Aplicados juntos funcionam como dois filtros independentes sobre a mesma
   * coluna (redundante se preenchidos com sites diferentes, inofensivo).
   */
  sites?: string;
  local?: string;
  evento?: string;
  atividade?: string;
  grupoSite?: string;
  grupoUsuario?: string;
  /** true inclui sites com ativo=false na lista de Locais. */
  locaisInativos?: boolean;
  motivo?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    coletorDados: primeiro(params.coletor_dados),
    funcionario: primeiro(params.funcionario),
    checkpoint: primeiro(params.checkpoint),
    sites: primeiro(params.sites),
    local: primeiro(params.local),
    evento: primeiro(params.evento),
    atividade: primeiro(params.atividade),
    grupoSite: primeiro(params.grupo_site),
    grupoUsuario: primeiro(params.grupo_usuario),
    locaisInativos: primeiro(params.locais_inativos) === "sim",
    motivo: primeiro(params.motivo),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  coletoresDados: Opcao[];
  funcionarios: Opcao[];
  checkpoints: Opcao[];
  sitesAgrupados: Opcao[];
  locais: Opcao[];
  eventos: Opcao[];
  atividades: Opcao[];
  gruposSites: Opcao[];
  gruposUsuarios: Opcao[];
  motivos: Opcao[];
};

function toOptions<T extends Record<string, unknown>>(
  rows: T[] | null,
  idKey: keyof T,
  labelKey: keyof T,
): Opcao[] {
  return (rows ?? []).map((row) => ({
    value: String(row[idKey]),
    label: String(row[labelKey]),
  }));
}

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

/** Sem cache manual (mesmo motivo de registro-de-rondas/queries.ts): listas
 * recortadas por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [coletoresDados, funcionarios, checkpoints, sitesComGrupo, locais, eventos, atividades, gruposSites, gruposUsuarios, motivos] =
    await Promise.all([
      supabase.from("coletores_dados").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
      supabase.from("qr_codes").select("id, codigo").eq("ativo", true).order("codigo"),
      supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
      supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("acoes").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("grupos_sites").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("grupos_usuarios").select("id, nome").order("nome"),
      supabase.from("motivos_visita").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  return {
    coletoresDados: toOptions(coletoresDados.data, "id", "nome"),
    funcionarios: toOptions(funcionarios.data, "id", "nome_completo"),
    checkpoints: toOptions(checkpoints.data, "id", "codigo"),
    sitesAgrupados: ((sitesComGrupo.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    locais: toOptions(locais.data, "id", "nome"),
    eventos: toOptions(eventos.data, "id", "nome"),
    atividades: toOptions(atividades.data, "id", "nome"),
    gruposSites: toOptions(gruposSites.data, "id", "nome"),
    gruposUsuarios: toOptions(gruposUsuarios.data, "id", "nome"),
    motivos: toOptions(motivos.data, "id", "nome"),
  };
}

/** Teto de dias no periodo -- sem isto um intervalo de anos gerava colunas
 * sem fim. ~2 meses cobre o uso real deste relatorio (mapa de cobertura
 * recente), como as exportacoes com LIMITE_EXPORTACAO em outras telas. */
export const LIMITE_DIAS = 62;

function paraDate(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function paraISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

/** Lista de dias (yyyy-mm-dd) entre inicio e fim, inclusive. Construida a
 * partir dos componentes (ano/mes/dia), nao de `new Date(iso)`: o mesmo
 * cuidado do FilterDatePicker -- string ISO pura vira meia-noite UTC, que em
 * fuso negativo volta um dia na leitura local. */
export function listarDias(inicioIso: string, fimIso: string): string[] {
  const dias: string[] = [];
  let atual = paraDate(inicioIso);
  const fim = paraDate(fimIso);
  while (atual.getTime() <= fim.getTime()) {
    dias.push(paraISO(atual));
    atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 1);
  }
  return dias;
}

/** "yyyy-mm-dd" -> "dd/mm", como na referencia. */
export function formatarDiaCurto(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export type LinhaMapa = {
  siteId: number;
  siteNome: string;
  /** "yyyy-mm-dd" -> quantidade de inspecoes (visitas distintas) no dia. Dia
   * sem entrada aqui vale 0. */
  porDia: Record<string, number>;
  /** Visitas distintas no periodo inteiro -- nao e a soma de porDia quando
   * uma visita tem leituras em dois dias (ver combinaFiltrosDeDetalhe). */
  total: number;
};

/** Uma linha de `relatorio_mapa_de_locais` (migration 0049). `dia` chega como
 * "yyyy-mm-dd" (tipo `date` do Postgres). */
export type ContagemDoBanco = { site_id: number; dia: string; quantidade: number };

/**
 * Sites base + contagens do banco -> linhas da tela.
 *
 * `sitesBase` decide quais linhas existem (todo Local aparece, mesmo com zero
 * visitas -- e o ponto do relatorio, mapear cobertura); as contagens por dia
 * vem prontas do banco desde a 0049. La tambem ficaram as regras que antes
 * moravam aqui: visita distinta e nao leitura, dia da leitura mais antiga no
 * fuso da operacao, e filtros de detalhe em qualquer leitura da visita.
 *
 * `total` e a soma dos dias: cada visita conta num dia so (o da leitura mais
 * antiga), entao somar nao conta visita duas vezes. Pura, para ser testada
 * sem mockar o Supabase.
 */
export function montarLinhasDoMapa(
  sitesBase: { id: number; nome: string }[],
  contagens: ContagemDoBanco[],
): LinhaMapa[] {
  const porSite = new Map<number, Record<string, number>>();
  for (const contagem of contagens) {
    const dias = porSite.get(contagem.site_id) ?? {};
    dias[contagem.dia] = contagem.quantidade;
    porSite.set(contagem.site_id, dias);
  }

  return sitesBase
    .map((site) => {
      const porDia = porSite.get(site.id) ?? {};
      return {
        siteId: site.id,
        siteNome: site.nome,
        porDia,
        total: Object.values(porDia).reduce((soma, n) => soma + n, 0),
      };
    })
    .sort((a, b) => a.siteNome.localeCompare(b.siteNome, "pt-BR"));
}

/** `query: any` pelo mesmo motivo das demais telas: o cliente aqui nao
 * carrega o generic `Database`. */
function aplicarFiltrosDeSite(query: any, filtros: Filtros) {
  let q = query;
  if (!filtros.locaisInativos) q = q.eq("ativo", true);
  if (filtros.local) q = q.eq("id", filtros.local);
  if (filtros.sites) q = q.eq("id", filtros.sites);
  if (filtros.grupoSite) q = q.eq("grupo_site_id", filtros.grupoSite);
  return q;
}

export type MapaDeLocaisInspecionados = {
  dias: string[];
  linhas: LinhaMapa[];
  diasExcedidos: boolean;
};

/** null quando o periodo (Data Inicial/Final) nao foi informado -- a tela
 * pede os dois antes de rodar, mesmo criterio do "Selecione um local" em
 * visitas-de-supervisao. */
export async function getMapaDeLocaisInspecionados(filtros: Filtros): Promise<MapaDeLocaisInspecionados | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;
  if (periodoInvertido(filtros.dataInicial, filtros.dataFinal)) return null;

  const dias = listarDias(filtros.dataInicial, filtros.dataFinal);
  const diasExcedidos = dias.length > LIMITE_DIAS;
  const diasConsultados = diasExcedidos ? dias.slice(0, LIMITE_DIAS) : dias;
  const { inicio, fim } = periodoEntreDatas(diasConsultados[0], diasConsultados[diasConsultados.length - 1]);

  const supabase = await createClient();

  // Os filtros de site (Local, Sites, Grupo de Sites, inativos) recortam a
  // lista de LINHAS, em `aplicarFiltrosDeSite`; o banco conta para todos os
  // sites e so aparecem os da base. Os demais recortam as contagens.
  const p_filtros = filtrosParaRpc({
    funcionario: filtros.funcionario,
    motivo: filtros.motivo,
    coletor_dados: filtros.coletorDados,
    grupo_usuario: filtros.grupoUsuario,
    evento: filtros.evento,
    checkpoint: filtros.checkpoint,
    atividade: filtros.atividade,
  });

  const [sitesResultado, contagens] = await Promise.all([
    aplicarFiltrosDeSite(supabase.from("sites").select("id, nome").order("nome"), filtros),
    // Paginado: sao ate sites x 62 dias linhas, e o PostgREST corta em
    // `max_rows` sem avisar. Ordenacao estavel, que `buscarEmPaginas` exige.
    buscarEmPaginas<ContagemDoBanco>((de, ate) =>
      supabase
        .rpc("relatorio_mapa_de_locais", { p_inicio: inicio, p_fim: fim, p_filtros })
        .order("site_id", { ascending: true })
        .order("dia", { ascending: true })
        .range(de, ate),
    ),
  ]);

  if (sitesResultado.error) throw sitesResultado.error;

  if (contagens.atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Mapa de Locais Inspecionados: teto de agregação atingido; as contagens estão incompletas.");
  }

  const linhas = montarLinhasDoMapa((sitesResultado.data ?? []) as { id: number; nome: string }[], contagens.linhas);

  return { dias: diasConsultados, linhas, diasExcedidos };
}

export function paraLinhaDeExportacao(linha: LinhaMapa, dias: string[]): string[] {
  return [linha.siteNome, ...dias.map((dia) => String(linha.porDia[dia] ?? 0)), String(linha.total)];
}

export function colunasDeExportacao(dias: string[]): string[] {
  return ["Local", ...dias.map(formatarDiaCurto), "Total"];
}
