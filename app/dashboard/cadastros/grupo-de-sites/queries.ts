import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";

export const PAGE_SIZE = 25;

export type GrupoSiteFiltros = {
  busca?: string;
  pagina: number;
};

export type GrupoSiteRow = {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

/** Forma usada pelo formulario -- inclui `grupo_pai_id` (migration 0024), que
 * a listagem e a exportacao nao precisam. */
export type GrupoSiteDetalhe = GrupoSiteRow & { grupo_pai_id: number | null };

/**
 * Busca livre: um campo so, procurando em nome e descricao, como na tela
 * antiga. Quem digita "portaria" espera achar tambem o grupo cuja descricao
 * menciona portaria.
 *
 * Extraida para ser reaproveitada por `getGruposSitesParaExportar`: mesma
 * consulta de `getGruposSites`, sem a paginacao. O cliente do Supabase aqui
 * nao carrega o generic `Database` (nenhum arquivo em `lib/supabase/`
 * declara um), entao o builder do PostgREST nao expoe um tipo generico
 * proprio para "o mesmo builder de volta" -- o cast de volta para `Q` depois
 * do `.or()` e o preco de aceitar o builder de qualquer uma das duas
 * consultas nesta funcao so.
 */
function comBusca<Q extends { or(filtro: string): unknown }>(
  query: Q,
  busca: string | undefined,
): Q {
  if (!busca) return query;
  const termo = termoParaOr(busca);
  return query.or(`nome.ilike."%${termo}%",descricao.ilike."%${termo}%"`) as Q;
}

export async function getGruposSites(filtros: GrupoSiteFiltros): Promise<{
  rows: GrupoSiteRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const query = comBusca(
    supabase
      .from("grupos_sites")
      .select("id, nome, descricao, ativo", { count: "exact" })
      // Sem desempate de proposito: `grupos_sites.nome` e `not null unique`
      // (migration 0003), entao esta ordenacao ja e total e a paginacao nao
      // repete nem pula linha. Se a restricao de unicidade cair, um
      // `.order("id")` passa a ser necessario aqui.
      .order("nome", { ascending: true })
      .range(from, to),
    filtros.busca,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as GrupoSiteRow[], totalItems: count ?? 0 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

/**
 * Mesma consulta de `getGruposSites`, sem paginacao -- para os botoes de
 * exportar, que precisam do resultado inteiro dentro do filtro, nao so a
 * pagina atual. Pede um a mais que o limite para saber, sem uma segunda
 * consulta de `count`, se o resultado foi cortado.
 */
export async function getGruposSitesParaExportar(
  busca: string | undefined,
): Promise<{ rows: GrupoSiteRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const query = comBusca(
    supabase
      .from("grupos_sites")
      .select("id, nome, descricao, ativo")
      .order("nome", { ascending: true })
      .range(0, LIMITE_EXPORTACAO),
    busca,
  );

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as GrupoSiteRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
}

export async function getGrupoSite(id: number): Promise<GrupoSiteDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos_sites")
    .select("id, nome, descricao, ativo, grupo_pai_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Candidatos a "Grupo de Site Pai" (migration 0024). Mesmo criterio de
 * `getSitesParaSuperior` em `site-planta/queries.ts`: exclui so o proprio
 * grupo em edicao (nenhum grupo e pai de si mesmo -- a action recusa esse
 * caso de qualquer forma) e nao desce a arvore para tirar os descendentes,
 * porque a hierarquia e rasa e o ciclo, se acontecer, fica contido pela
 * constraint do banco.
 */
export async function getGruposSitesParaPai(excluirId?: number): Promise<Opcao[]> {
  const supabase = await createClient();

  let query = supabase.from("grupos_sites").select("id, nome").order("nome");
  if (excluirId !== undefined) query = query.neq("id", excluirId);

  const { data } = await query;

  return (data ?? []).map((grupo) => ({ value: String(grupo.id), label: grupo.nome }));
}

export type Opcao = { value: string; label: string };

type SiteBruto = { id: number; nome: string; site_superior_id: number | null; grupo_site_id: number };

export type SiteParaSelecao = {
  id: number;
  nome: string;
  /** Nivel na arvore de sites, para indentar a lista. */
  profundidade: number;
  /** Pai resolvido na arvore -- null para raiz e para quem entrou promovido
   * por ciclo (ver `montarHierarquiaDeSites`). Usado para marcar os filhos ao
   * marcar o pai no multi-select. */
  paiId: number | null;
  /** Grupo a que o site pertence hoje, para pre-marcar a selecao na edicao. */
  grupoSiteId: number;
};

/**
 * Achata a arvore de sites (`site_superior_id`, migration 0021) preservando
 * pai antes de filho, para o multi-select de "Sites" poder indentar e marcar
 * descendentes ao marcar um pai.
 *
 * Mesmo algoritmo cuidadoso com ciclo de `montarHierarquiaDeResponsaveis` em
 * `site-planta/queries.ts`: um conjunto de visitados evita recursao infinita
 * (A superior de B, B superior de A), e quem sobra fora da descida vira raiz
 * na segunda passada -- melhor aparecer sem a hierarquia certa do que sumir
 * da lista de selecao.
 */
export function montarHierarquiaDeSites(sites: SiteBruto[]): SiteParaSelecao[] {
  const filhos = new Map<number | null, SiteBruto[]>();
  const ids = new Set(sites.map((s) => s.id));

  for (const site of sites) {
    const pai =
      site.site_superior_id !== null && ids.has(site.site_superior_id) ? site.site_superior_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), site]);
  }

  const opcoes: SiteParaSelecao[] = [];
  const visitados = new Set<number>();

  const incluir = (site: SiteBruto, profundidade: number, paiId: number | null) => {
    visitados.add(site.id);
    opcoes.push({
      id: site.id,
      nome: site.nome,
      profundidade,
      paiId,
      grupoSiteId: site.grupo_site_id,
    });
  };

  const descer = (pai: number | null, profundidade: number) => {
    for (const site of filhos.get(pai) ?? []) {
      if (visitados.has(site.id)) continue;
      incluir(site, profundidade, pai);
      descer(site.id, profundidade + 1);
    }
  };

  descer(null, 0);

  for (const site of sites) {
    if (!visitados.has(site.id)) incluir(site, 0, null);
  }

  return opcoes;
}

/**
 * Lista de sites para o multi-select "Sites" do formulario, ja em ordem de
 * arvore. Sem recorte de `ativo`, mesmo criterio de `getOpcoes` em
 * `site-planta/queries.ts`: o formulario pode estar corrigindo justamente o
 * grupo de um site desativado.
 */
export async function getSitesParaSelecao(): Promise<SiteParaSelecao[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("sites")
    .select("id, nome, site_superior_id, grupo_site_id")
    .order("nome");

  return montarHierarquiaDeSites((data ?? []) as SiteBruto[]);
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(grupo: GrupoSiteRow): string[] {
  return [String(grupo.id), grupo.nome, grupo.ativo ? "Ativo" : "Inativo", grupo.descricao ?? ""];
}
