import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";

export const PAGE_SIZE = 25;

export type QrCodeFiltros = {
  busca?: string;
  site?: string;
  grupoSite?: string;
  situacao?: "ativos" | "inativos";
  pagina: number;
};

export type QrCodeRow = {
  id: number;
  codigo: string;
  finalidade: string | null;
  ativo: boolean;
  site_id: number;
  sites: {
    nome: string;
    grupo_site_id: number;
    grupos_sites: { nome: string } | null;
  } | null;
};

/**
 * `sites` entra sempre como embed simples, e vira `!inner` so quando ha filtro
 * naquele nivel -- mesmo criterio de `montarSelectDeColetas`. Ligado sempre,
 * o inner excluiria QR cujo site o RLS nao devolveu, o que faria a linha sumir
 * da listagem em vez de aparecer com o local em branco.
 *
 * Nada de comentario dentro desta string: ela vai crua na querystring do
 * PostgREST.
 */
function montarSelect(precisaSite: boolean): string {
  return `
    id, codigo, finalidade, ativo, site_id,
    ${precisaSite ? "sites!inner" : "sites"} (
      nome,
      grupo_site_id,
      grupos_sites ( nome )
    )
  `;
}

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

/** Exportada para as rotas de Excel/PDF lerem exatamente os mesmos filtros da
 * listagem, sem duplicar o mapeamento campo a campo. */
export function extrairFiltros(params: SearchParams): QrCodeFiltros {
  return {
    busca: primeiro(params.busca),
    site: primeiro(params.site),
    grupoSite: primeiro(params.grupo_site),
    situacao: primeiro(params.situacao) as "ativos" | "inativos" | undefined,
    pagina: Math.max(1, Number(primeiro(params.pagina)) || 1),
  };
}

/** Cabecalhos da tabela, sem a coluna "Ações" -- que so existe na tela. */
export const COLUNAS_EXPORTACAO = [
  "ID",
  "Código",
  "Site / Planta",
  "Grupo de Sites",
  "Finalidade",
  "Status",
];

/** Busca livre em codigo e finalidade. Coberta pelos indices trigram da
 * migration 0015; `ilike '%termo%'` nao usa btree comum. */
function comBusca<Q extends { or(filtro: string): unknown }>(query: Q, busca: string | undefined): Q {
  if (!busca) return query;
  const termo = termoParaOr(busca);
  return query.or(`codigo.ilike."%${termo}%",finalidade.ilike."%${termo}%"`) as Q;
}

/** `query: any` pelo mesmo motivo descrito em `coletas-importadas/queries.ts`:
 * reencadear tipado exigiria repetir cada metodo do builder na assinatura. */
function aplicarFiltros(query: any, filtros: Omit<QrCodeFiltros, "pagina">) {
  let q = comBusca(query, filtros.busca);

  if (filtros.site) q = q.eq("site_id", filtros.site);
  if (filtros.grupoSite) q = q.eq("sites.grupo_site_id", filtros.grupoSite);
  if (filtros.situacao === "ativos") q = q.eq("ativo", true);
  if (filtros.situacao === "inativos") q = q.eq("ativo", false);

  return q;
}

/** O join com `sites` so precisa ser inner quando o filtro e por grupo: filtrar
 * dentro de um embed opcional nao restringe a consulta de cima. Filtrar por
 * site usa `site_id`, que esta na propria linha -- nao precisa de join. */
function precisaSite(filtros: Omit<QrCodeFiltros, "pagina">): boolean {
  return Boolean(filtros.grupoSite);
}

export async function getQrCodes(filtros: QrCodeFiltros): Promise<{
  rows: QrCodeRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const query = aplicarFiltros(
    supabase
      .from("qr_codes")
      .select(montarSelect(precisaSite(filtros)), { count: "exact" })
      // Sem desempate: `codigo` e `not null unique` (migration 0003), entao
      // esta ordenacao ja e total e a paginacao nao repete nem pula linha --
      // mesma situacao de `grupos_sites.nome`, e diferente de `sites.nome`.
      .order("codigo", { ascending: true })
      .range(from, to),
    filtros,
  );

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as QrCodeRow[], totalItems: count ?? 0 };
}

/** Teto de linhas nas exportacoes: evita devolver uma tabela sem fim. */
export const LIMITE_EXPORTACAO = 2000;

/** Mesma consulta de `getQrCodes`, sem paginacao. Pede um a mais que o limite
 * para saber, sem uma segunda consulta de `count`, se o resultado foi cortado. */
export async function getQrCodesParaExportar(
  filtros: Omit<QrCodeFiltros, "pagina">,
): Promise<{ rows: QrCodeRow[]; truncado: boolean }> {
  const supabase = await createClient();

  const query = aplicarFiltros(
    supabase
      .from("qr_codes")
      .select(montarSelect(precisaSite(filtros)))
      .order("codigo", { ascending: true })
      .range(0, LIMITE_EXPORTACAO),
    filtros,
  );

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as QrCodeRow[];
  return { rows: rows.slice(0, LIMITE_EXPORTACAO), truncado: rows.length > LIMITE_EXPORTACAO };
}

export async function getQrCode(id: number): Promise<QrCodeRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("qr_codes")
    .select(montarSelect(false))
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as QrCodeRow | null;
}

export type Opcao = { value: string; label: string };

/**
 * Listas para os selects, tanto do filtro quanto do formulario.
 *
 * `sites` ja vem recortado pelo RLS (migration 0014): um CLIENTE so enxerga os
 * do proprio grupo. Sem recorte de `ativo`, pelo mesmo motivo da tela de
 * Site / Planta: um QR pode estar sendo corrigido justamente para sair de um
 * site desativado, e esconder a opcao impediria a correcao.
 */
export async function getOpcoes(): Promise<{ sites: Opcao[]; gruposSites: Opcao[] }> {
  const supabase = await createClient();

  const [sites, grupos] = await Promise.all([
    supabase.from("sites").select("id, nome").order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
  ]);

  return {
    sites: (sites.data ?? []).map((site) => ({ value: String(site.id), label: site.nome })),
    gruposSites: (grupos.data ?? []).map((grupo) => ({
      value: String(grupo.id),
      label: grupo.nome,
    })),
  };
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(qrCode: QrCodeRow): string[] {
  return [
    String(qrCode.id),
    qrCode.codigo,
    qrCode.sites?.nome ?? "",
    qrCode.sites?.grupos_sites?.nome ?? "",
    qrCode.finalidade ?? "",
    qrCode.ativo ? "Ativo" : "Inativo",
  ];
}
