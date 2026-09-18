import { dataValida, formatarDiaCurto, listarDias, periodoEntreDatas } from "@/lib/data-hora";
import { ORGANIZACAO } from "@/lib/hierarquia-de-sites";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { filtrosParaRpc } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Filtros da tela de referencia. Periodo por Data Inicial/Final (e nao
 * Mês/Ano, como o Mapa de Eventos). "Status" nao entra aqui: o schema nao
 * guarda situacao de tratativa da ocorrencia -- ver o comentario do campo em
 * page.tsx.
 */
export type Filtros = {
  dataInicial?: string;
  dataFinal?: string;
  grupoUsuario?: string;
  sites?: string;
  evento?: string;
  usuario?: string;
};

export function extrairFiltros(params: SearchParams): Filtros {
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)),
    dataFinal: dataValida(primeiro(params.data_final)),
    grupoUsuario: primeiro(params.grupo_usuario),
    sites: primeiro(params.sites),
    evento: primeiro(params.evento),
    usuario: primeiro(params.usuario),
  };
}

export type Opcao = { value: string; label: string };

export type OpcoesFiltros = {
  gruposUsuarios: Opcao[];
  sites: Opcao[];
  eventos: Opcao[];
  usuarios: Opcao[];
};

type SiteComGrupo = { id: number; nome: string; grupos_sites: { nome: string } | null };

function paraOpcoes(linhas: { id: number | string; nome: string | null }[] | null): Opcao[] {
  return (linhas ?? []).map((linha) => ({ value: String(linha.id), label: linha.nome ?? "" }));
}

/** Sem cache manual, pelo mesmo motivo dos demais relatorios: `sites`,
 * `profiles` e `grupos_usuarios` sao recortados por RLS conforme quem pede. */
export async function getOpcoesFiltros(): Promise<OpcoesFiltros> {
  const supabase = await createClient();

  const [gruposUsuarios, sites, eventos, usuarios] = await Promise.all([
    supabase.from("grupos_usuarios").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true).order("nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    gruposUsuarios: paraOpcoes(gruposUsuarios.data),
    // "Grupo - Site", como no Registro de Eventos e no Mapa de Eventos.
    sites: ((sites.data ?? []) as unknown as SiteComGrupo[]).map((site) => ({
      value: String(site.id),
      label: site.grupos_sites?.nome ? `${site.grupos_sites.nome} - ${site.nome}` : site.nome,
    })),
    eventos: paraOpcoes(eventos.data),
    usuarios: paraOpcoes((usuarios.data ?? []).map((u) => ({ id: u.id, nome: u.nome_completo }))),
  };
}

/** Teto de dias no periodo, o mesmo do Mapa de Locais Inspecionados: uma
 * coluna por dia, e um intervalo de anos daria uma grade sem fim. */
export const LIMITE_DIAS = 62;

/** Um site da base de linhas: todo site ativo no escopo de quem pede aparece,
 * mesmo sem evento -- como na referencia, onde os zeros sao a maioria. */
export type SiteDaBase = { id: number; nome: string; grupoNome: string | null };

/** Uma linha de `relatorio_mapa_de_eventos_por_site` (migration 0057). `dia`
 * chega como "yyyy-mm-dd" (tipo `date` do Postgres). */
export type ContagemDoBanco = { site_id: number; dia: string; quantidade: number };

/**
 * Um no da arvore da tela: a organizacao, um grupo de sites ou um site. O no
 * de cima soma os de baixo -- e o que a linha "UP Serviços" da referencia
 * mostra antes de expandir.
 */
export type NoDoMapa = {
  chave: string;
  nome: string;
  /** Caminho "UP Serviços > Grupo > Site", para a exportacao. */
  caminho: string;
  /** Quantidade por coluna de dia, na ordem de `dias`. */
  porDia: number[];
  filhos: NoDoMapa[];
};

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

function somar(filhos: NoDoMapa[], dias: number): number[] {
  const total = Array.from({ length: dias }, () => 0);
  for (const filho of filhos) filho.porDia.forEach((n, i) => (total[i] += n));
  return total;
}

/**
 * Sites + contagens -> a arvore UP Serviços > grupo > site.
 *
 * Site sem grupo fica direto embaixo da organizacao, como "ACE Limpeza" no
 * print da referencia. Grupos e sites soltos se misturam na mesma ordem
 * alfabetica (pt-BR), que e como a referencia lista as pastas.
 *
 * Contagem de um site fora da base (inativo, ou recortado pelo filtro de
 * Sites) nao entra: a linha nao existe na tela, entao a soma da organizacao
 * tambem nao a inclui -- o total bate com o que se ve ao expandir.
 *
 * Pura, para ser testada sem mockar o Supabase.
 */
export function montarArvore(dias: string[], sites: SiteDaBase[], contagens: ContagemDoBanco[]): NoDoMapa {
  const indiceDoDia = new Map(dias.map((dia, i) => [dia, i]));
  const porSite = new Map<number, number[]>();
  for (const contagem of contagens) {
    const i = indiceDoDia.get(contagem.dia);
    if (i === undefined) continue;
    const linha = porSite.get(contagem.site_id) ?? Array.from({ length: dias.length }, () => 0);
    linha[i] += contagem.quantidade;
    porSite.set(contagem.site_id, linha);
  }

  const noDoSite = (site: SiteDaBase): NoDoMapa => ({
    chave: `site-${site.id}`,
    nome: site.nome,
    caminho: [ORGANIZACAO, site.grupoNome, site.nome].filter(Boolean).join(" > "),
    porDia: porSite.get(site.id) ?? Array.from({ length: dias.length }, () => 0),
    filhos: [],
  });

  const grupos = new Map<string, SiteDaBase[]>();
  const soltos: SiteDaBase[] = [];
  for (const site of sites) {
    if (site.grupoNome) grupos.set(site.grupoNome, [...(grupos.get(site.grupoNome) ?? []), site]);
    else soltos.push(site);
  }

  const nosDeGrupo: NoDoMapa[] = Array.from(grupos.entries()).map(([nome, doGrupo]) => {
    const filhos = doGrupo.map(noDoSite).sort(porNome);
    return {
      chave: `grupo-${nome}`,
      nome,
      caminho: `${ORGANIZACAO} > ${nome}`,
      porDia: somar(filhos, dias.length),
      filhos,
    };
  });

  const filhos = [...nosDeGrupo, ...soltos.map(noDoSite)].sort(porNome);

  return {
    chave: "organizacao",
    nome: ORGANIZACAO,
    caminho: ORGANIZACAO,
    porDia: somar(filhos, dias.length),
    filhos,
  };
}

export type MapaDeEventosPorSite = {
  /** "yyyy-mm-dd", uma por coluna. */
  dias: string[];
  raiz: NoDoMapa;
  /** O periodo passou de `LIMITE_DIAS` e foi cortado. */
  diasExcedidos: boolean;
};

type SiteDoBanco = { id: number; nome: string; grupos_sites: { nome: string } | null };

/** `null` enquanto o periodo nao esta completo -- a tela pede as duas datas
 * antes de consultar, como Registro de Eventos e Mapa de Locais. */
export async function getMapaDeEventosPorSite(filtros: Filtros): Promise<MapaDeEventosPorSite | null> {
  if (!filtros.dataInicial || !filtros.dataFinal) return null;

  const todos = listarDias(filtros.dataInicial, filtros.dataFinal);
  // Data Final antes da Inicial: nenhum dia, nada a consultar.
  if (todos.length === 0) return { dias: [], raiz: montarArvore([], [], []), diasExcedidos: false };

  const diasExcedidos = todos.length > LIMITE_DIAS;
  const dias = diasExcedidos ? todos.slice(0, LIMITE_DIAS) : todos;
  const { inicio, fim } = periodoEntreDatas(dias[0], dias[dias.length - 1]);

  const supabase = await createClient();

  // "Sites" recorta as LINHAS (a base); os demais filtros recortam as
  // contagens -- um site sem evento com o filtro aplicado continua na tela, em
  // verde, como os demais.
  let consultaDeSites = supabase.from("sites").select("id, nome, grupos_sites ( nome )").eq("ativo", true);
  if (filtros.sites) consultaDeSites = consultaDeSites.eq("id", Number(filtros.sites));

  const p_filtros = filtrosParaRpc({
    site: filtros.sites,
    evento: filtros.evento,
    funcionario: filtros.usuario,
    grupo_usuario: filtros.grupoUsuario,
  });

  const [sitesResultado, contagens] = await Promise.all([
    consultaDeSites,
    // Paginado: sao ate sites x 62 dias linhas, e o PostgREST corta em
    // `max_rows` sem avisar. Ordenacao estavel, que `buscarEmPaginas` exige.
    buscarEmPaginas<ContagemDoBanco>((de, ate) =>
      supabase
        .rpc("relatorio_mapa_de_eventos_por_site", { p_inicio: inicio, p_fim: fim, p_filtros })
        .order("site_id", { ascending: true })
        .order("dia", { ascending: true })
        .range(de, ate),
    ),
  ]);

  if (sitesResultado.error) throw sitesResultado.error;
  if (contagens.atingiuTeto) {
    erro(gerarIdDeRequisicao(), "Mapa de Eventos por Site: teto de agregação atingido; o período exibido está incompleto.");
  }

  const sites = ((sitesResultado.data ?? []) as unknown as SiteDoBanco[]).map((site) => ({
    id: site.id,
    nome: site.nome,
    grupoNome: site.grupos_sites?.nome ?? null,
  }));

  return { dias, raiz: montarArvore(dias, sites, contagens.linhas), diasExcedidos };
}

/** Cabecalho da exportacao: "Site" e um "dd/mm" por dia. */
export function colunasDeExportacao(dias: string[]): string[] {
  return ["Site", ...dias.map(formatarDiaCurto)];
}

/** A arvore inteira, aberta, em linhas de texto -- no Excel/PDF nao ha como
 * expandir, entao sai tudo, cada linha com o caminho completo. */
export function paraLinhasDeExportacao(raiz: NoDoMapa): string[][] {
  const linhas: string[][] = [];
  const visitar = (no: NoDoMapa) => {
    linhas.push([no.caminho, ...no.porDia.map(String)]);
    no.filhos.forEach(visitar);
  };
  visitar(raiz);
  return linhas;
}
