import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";

export const PAGE_SIZE = 25;

export type SiteFiltros = {
  busca?: string;
  grupoSite?: string;
  tipoServico?: string;
  situacao?: "ativos" | "inativos";
  pagina: number;
};

export type SiteRow = {
  id: number;
  nome: string;
  sigla: string | null;
  regional: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  ativo: boolean;
  grupo_site_id: number;
  tipo_servico_id: number | null;
  responsavel_id: string | null;
  grupos_sites: { nome: string } | null;
  tipos_servico: { nome: string } | null;
  responsavel: { nome_completo: string } | null;
};

/**
 * A FK do responsavel precisa ir nomeada (`!responsavel_id`): `sites` aponta
 * para `profiles` duas vezes -- por `responsavel_id` e por `criado_por`. Sem
 * dizer qual, o PostgREST recusa a consulta inteira com PGRST201 em vez de
 * escolher uma, e a tela cai no error boundary sem renderizar linha nenhuma.
 * Mesmo padrao de `superior:profiles!superior_id` em usuarios/queries.ts.
 *
 * Nada de comentario dentro desta string: ela vai crua na querystring do
 * PostgREST, que so tolera a remocao de espaco em branco feita pelo client.
 */
const COLUNAS = `
  id, nome, sigla, regional, cidade, uf, latitude, longitude, observacao, ativo,
  grupo_site_id, tipo_servico_id, responsavel_id,
  grupos_sites ( nome ),
  tipos_servico ( nome ),
  responsavel:profiles!responsavel_id ( nome_completo )
`;

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

/** Formato bruto do `searchParams` do Next -- cada chave pode vir repetida na
 * URL, daí o valor poder ser array. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

/**
 * Le os filtros da querystring. Exportada (nao so usada por `page.tsx`) para
 * as rotas de exportar em Excel/PDF lerem exatamente os mesmos filtros da
 * listagem, sem duplicar o mapeamento campo a campo -- mesmo arranjo de
 * `coletas-importadas/queries.ts`.
 */
export function extrairFiltros(params: SearchParams): SiteFiltros {
  return {
    busca: primeiro(params.busca),
    grupoSite: primeiro(params.grupo_site),
    tipoServico: primeiro(params.tipo_servico),
    situacao: primeiro(params.situacao) as "ativos" | "inativos" | undefined,
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Cabecalhos da tabela, sem a coluna "Ações" -- que so existe na tela.
 * Compartilhados com as duas rotas de exportacao. */
export const COLUNAS_EXPORTACAO = [
  "ID",
  "Nome",
  "Sigla",
  "Grupo de Sites",
  "Tipo de Serviço",
  "Cidade / UF",
  "Regional",
  "Responsável",
  "Coordenadas",
  "Status",
];

/**
 * Busca livre em nome, sigla e cidade -- os tres campos por onde se procura
 * uma unidade na pratica. Coberta pelos indices trigram da migration 0012;
 * `ilike '%termo%'` nao usa btree comum.
 *
 * Mesmo padrao (e mesma ressalva de tipo) de `comBusca` em
 * `grupo-de-sites/queries.ts`: o cliente do Supabase aqui nao carrega o
 * generic `Database`, entao o builder do PostgREST nao expoe um tipo proprio
 * para "o mesmo builder de volta" depois do `.or()`.
 */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;
  const termo = termoParaOr(busca);
  return query.or(
    `nome.ilike."%${termo}%",sigla.ilike."%${termo}%",cidade.ilike."%${termo}%"`,
  ) as Q;
}

/** `query: any` pelo mesmo motivo descrito em `coletas-importadas/queries.ts`:
 * reencadear tipado exigiria repetir cada metodo do builder na assinatura. */
function aplicarFiltros(query: any, filtros: Omit<SiteFiltros, "pagina">) {
  let q = comBusca(query, filtros.busca);

  if (filtros.grupoSite) q = q.eq("grupo_site_id", filtros.grupoSite);
  if (filtros.tipoServico) q = q.eq("tipo_servico_id", filtros.tipoServico);
  if (filtros.situacao === "ativos") q = q.eq("ativo", true);
  if (filtros.situacao === "inativos") q = q.eq("ativo", false);

  return q;
}

export async function getSites(filtros: SiteFiltros): Promise<{
  rows: SiteRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const query = aplicarFiltros(
    supabase
      .from("sites")
      .select(COLUNAS, { count: "exact" })
      .order("nome", { ascending: true })
      // Desempate obrigatorio, ao contrario de `grupos_sites`: a unicidade de
      // `sites.nome` e do par com o grupo (migration 0012), nao da coluna --
      // dois grupos podem ter uma "Agencia Centro" cada. Sem o desempate, a
      // ordem entre elas nao e garantida e a paginacao pode repetir uma e
      // pular outra.
      .order("id", { ascending: true })
      .range(from, to),
    filtros,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as SiteRow[], totalItems: count ?? 0 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

/**
 * Mesma consulta de `getSites`, sem paginacao -- para os botoes de exportar,
 * que precisam do resultado inteiro dentro do filtro, nao so a pagina atual.
 * Pede um a mais que o limite para saber, sem uma segunda consulta de `count`,
 * se o resultado foi cortado.
 */
export async function getSitesParaExportar(
  filtros: Omit<SiteFiltros, "pagina">,
): Promise<{ rows: SiteRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const query = aplicarFiltros(
    supabase
      .from("sites")
      .select(COLUNAS)
      .order("nome", { ascending: true })
      .order("id", { ascending: true })
      .range(0, LIMITE_EXPORTACAO),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as SiteRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
}

export async function getSite(id: number): Promise<SiteRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("sites").select(COLUNAS).eq("id", id).maybeSingle();

  if (error) throw error;
  return data as unknown as SiteRow | null;
}

export type Opcao = { value: string; label: string };

/**
 * Listas para os selects, tanto do filtro quanto do formulario.
 *
 * Sem o recorte de `ativo` que `coletas-importadas/queries.ts` aplica: la as
 * opcoes filtram dado historico e um grupo desativado nao interessa mais;
 * aqui elas preenchem um cadastro que pode estar justamente sendo corrigido
 * para sair de um grupo desativado. Esconder a opcao impediria a correcao.
 */
export async function getOpcoes(): Promise<{
  gruposSites: Opcao[];
  tiposServico: Opcao[];
  responsaveis: Opcao[];
}> {
  const supabase = await createClient();

  const [grupos, tipos, perfis] = await Promise.all([
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("tipos_servico").select("id, nome").order("nome"),
    // `profiles` e recortado pelo RLS (migration 0006): um operador so enxerga
    // a propria linha. A lista fica curta para quem nao e gestao, o que e o
    // comportamento correto -- e quem nao e gestao tambem nao edita cadastro.
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);

  return {
    gruposSites: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    tiposServico: (tipos.data ?? []).map((t) => ({ value: String(t.id), label: t.nome })),
    responsaveis: (perfis.data ?? []).map((p) => ({ value: p.id, label: p.nome_completo })),
  };
}

/** Coordenada formatada para a tabela. Nula quer dizer "ainda nao cadastrada"
 * (migration 0003), nao zero -- daí o campo vazio em vez de "0". */
function formatarCoordenadas(site: SiteRow): string {
  if (site.latitude === null || site.longitude === null) return "";
  return `${site.latitude}, ${site.longitude}`;
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(site: SiteRow): string[] {
  return [
    String(site.id),
    site.nome,
    site.sigla ?? "",
    site.grupos_sites?.nome ?? "",
    site.tipos_servico?.nome ?? "",
    [site.cidade, site.uf].filter(Boolean).join(" / "),
    site.regional ?? "",
    site.responsavel?.nome_completo ?? "",
    formatarCoordenadas(site),
    site.ativo ? "Ativo" : "Inativo",
  ];
}
