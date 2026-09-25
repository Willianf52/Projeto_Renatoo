import { dataValida, periodoEntreDatas } from "@/lib/data-hora";
import { niveisDoSite } from "@/lib/hierarquia-de-sites";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Qual carimbo o periodo recorta. A tela de referencia chama o campo de
 * "Data de Inserção" e e esse o padrao dela -- quem fecha o mes conta o que
 * CHEGOU no mes, e o aparelho pode subir dias depois (ver 0004).
 *
 *   insercao -> `leituras.data_integracao`
 *   evento   -> `leituras.data_hora`
 */
export type BaseDeData = "insercao" | "evento";

export const BASES_DE_DATA: { value: BaseDeData; label: string }[] = [
  { value: "insercao", label: "Data de Inserção" },
  { value: "evento", label: "Data do Evento" },
];

export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  baseDeData: BaseDeData;
  sites?: string;
  evento?: string;
  usuario?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  const base = primeiro(params.base_data);
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    // Valor desconhecido na querystring cai no padrao em vez de virar um
    // terceiro modo silencioso -- e o `case` da 0055 so conhece dois.
    baseDeData: base === "evento" ? "evento" : "insercao",
    sites: filtroDeId(primeiro(params.sites)),
    evento: filtroDeId(primeiro(params.evento)),
    usuario: filtroDeUuid(primeiro(params.usuario)),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  sites: Opcao[];
  eventos: Opcao[];
  usuarios: Opcao[];
};

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

/**
 * Listas dos selects. Sem cache manual, pelo mesmo motivo dos relatorios de
 * Inspecoes: `sites` e `profiles` sao recortados por RLS conforme quem pede
 * (0006/0014), e guardar resultado recortado entre usuarios vazaria a lista de
 * um cliente para outro.
 */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [sites, eventos, usuarios] = await Promise.all([
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    // "Grupo - Site", como em Mapa de Locais Inspecionados: o campo Sites da
    // referencia ocupa a linha inteira porque o rotulo carrega o grupo junto.
    sites: ((sites.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    eventos: (eventos.data ?? []).map((evento) => ({ value: String(evento.id), label: evento.nome })),
    // `nome_completo` e nullable no schema: sem o fallback o rotulo viraria
    // "null" no select, em vez de uma opcao vazia que da para ignorar.
    usuarios: (usuarios.data ?? []).map((usuario) => ({
      value: String(usuario.id),
      label: usuario.nome_completo ?? "",
    })),
  };
}

/** Uma linha de `relatorio_registro_de_eventos` (migration 0055). */
export type LinhaDoBanco = {
  site_id: number;
  site_nome: string;
  grupo_site_nome: string | null;
  evento_id: number;
  evento_nome: string;
  quantidade: number;
};

export type LinhaDeEvento = {
  siteId: number;
  siteNome: string;
  /** "UP Serviços" > grupo > site, como a Hierarquia de Site / Planta e a
   * coluna Site da referencia. A tela desenha um chevron entre os niveis; a
   * exportacao junta com " > ". */
  siteNiveis: string[];
  eventoId: number;
  eventoNome: string;
  quantidade: number;
  /** Participacao da linha no total do relatorio, em pontos percentuais. */
  percentual: number;
};

export type RegistroDeEventos = {
  linhas: LinhaDeEvento[];
  /** Soma de TODAS as linhas do filtro, nao so as da pagina exibida -- e o
   * que a linha TOTAL da tela mostra. */
  total: number;
};

/**
 * Linhas do banco -> linhas da tela, com a coluna "%".
 *
 * A porcentagem nao vem do banco de proposito: seria a mesma soma repetida em
 * toda linha da resposta, e ela e sobre o conjunto INTEIRO -- calcular aqui,
 * uma vez, mantem o "%" coerente com o TOTAL mesmo quando a tela pagina.
 *
 * Ordem: maior quantidade primeiro, no relatorio inteiro -- como na
 * referencia, que abre com o par Site x Evento que mais pesa no periodo. Empate
 * cai na hierarquia do site e depois no nome do evento, para a ordem nao
 * depender de como o banco devolveu as linhas.
 *
 * `localeCompare("pt-BR")` e nao `order by` no banco: a collation do Postgres
 * nao e garantidamente a mesma (mesma razao da 0049).
 *
 * Pura, para ser testada sem mockar o Supabase.
 */
export function montarLinhas(doBanco: LinhaDoBanco[]): RegistroDeEventos {
  const total = doBanco.reduce((soma, linha) => soma + linha.quantidade, 0);

  const linhas = doBanco
    .map((linha) => ({
      siteId: linha.site_id,
      siteNome: linha.site_nome,
      siteNiveis: niveisDoSite(linha.grupo_site_nome, linha.site_nome),
      eventoId: linha.evento_id,
      eventoNome: linha.evento_nome,
      quantidade: linha.quantidade,
      // Sem divisao por zero: um resultado vazio nao chega a ter linha, mas a
      // funcao e chamada tambem pelos testes com listas montadas a mao.
      percentual: total > 0 ? (linha.quantidade / total) * 100 : 0,
    }))
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        a.siteNiveis.join(" > ").localeCompare(b.siteNiveis.join(" > "), "pt-BR") ||
        a.eventoNome.localeCompare(b.eventoNome, "pt-BR"),
    );

  return { linhas, total };
}

/**
 * `null` quando o periodo nao foi informado -- os dois campos, como em Mapa de
 * Locais Inspecionados. Sem limite inferior a consulta varreria `leituras`
 * inteira para montar um relatorio que ninguem pediu ainda.
 */
export async function getRegistroDeEventos(filtros: Filtros): Promise<RegistroDeEventos | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const supabase = await createClient();
  const { inicio, fim } = periodoEntreDatas(filtros.dataInicial, filtros.dataFinal);

  const p_filtros = filtrosParaRpc({
    site: filtros.sites,
    evento: filtros.evento,
    funcionario: filtros.usuario,
  });

  // Paginado mesmo sendo agregado: sao ate sites x eventos linhas, e o
  // PostgREST corta em `max_rows` (1000) sem avisar nem erro. A ordenacao
  // estavel e o que `buscarEmPaginas` exige.
  const { linhas, atingiuTeto } = await buscarEmPaginas<LinhaDoBanco>((de, ate) =>
    supabase
      .rpc("relatorio_registro_de_eventos", {
        p_inicio: inicio,
        p_fim: fim,
        p_por_data_insercao: filtros.baseDeData === "insercao",
        p_filtros,
      })
      .order("site_id", { ascending: true })
      .order("evento_id", { ascending: true })
      .range(de, ate),
  );

  if (atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Registro de Eventos: teto de agregação atingido; o período exibido está incompleto.");
  }

  return montarLinhas(linhas);
}

/** "12,50" -- duas casas e virgula decimal. Sem o "%": o cabecalho da coluna
 * ja diz a unidade, como na referencia. */
export function formatarPercentual(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export const TABLE_COLUMNS = ["Site", "Evento", "Quantidade", "%"];

/**
 * Colunas de texto para Excel/PDF. A coluna "Ações" nao vai: e um link de
 * navegacao, que nao existe numa planilha nem no papel.
 */
export function paraLinhasDeExportacao(registro: RegistroDeEventos): string[][] {
  return registro.linhas.map((linha) => [
    linha.siteNiveis.join(" > "),
    linha.eventoNome,
    String(linha.quantidade),
    formatarPercentual(linha.percentual),
  ]);
}

/** A linha "TOTAL:" do rodape, nas mesmas colunas da exportacao. Separada das
 * linhas de dado porque nao e um registro: no PDF ela vai no `tfoot`, fora da
 * contagem; no CSV entra como ultima linha, que e o unico lugar que um CSV
 * tem. */
export function linhaDeTotal(registro: RegistroDeEventos): string[] {
  return ["TOTAL:", "", String(registro.total), formatarPercentual(registro.total > 0 ? 100 : 0)];
}
