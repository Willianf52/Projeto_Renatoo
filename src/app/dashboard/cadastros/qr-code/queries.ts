import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";
import { LIMITE_EXPORTACAO, paginar, resultadoExportacao } from "@/lib/supabase/query-helpers";

export { LIMITE_EXPORTACAO };

export const PAGE_SIZE = 25;

export type Situacao = "ativos" | "todos" | "inativos";

export type QrCodeFiltros = {
  busca?: string;
  tipoServico?: string;
  grupoSite?: string;
  situacao: Situacao;
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
    tipo_servico_id: number | null;
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
      tipo_servico_id,
      grupos_sites ( nome )
    )
  `;
}

/**
 * "Todos" e opcao explicita, e "Ativos" e o default -- como no sistema de
 * referencia e em Site / Planta (`SITUACAO_PADRAO` la).
 */
export const SITUACAO_PADRAO: Situacao = "ativos";

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "todos", label: "Todos" },
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
  const situacao = primeiro(params.situacao);

  return {
    busca: primeiro(params.busca),
    tipoServico: primeiro(params.tipo_servico),
    grupoSite: primeiro(params.grupo_site),
    // Valor fora da lista cai no padrao em vez de virar filtro vazio: a URL e
    // editavel a mao, e `?situacao=xyz` mostrando tudo seria mentira silenciosa.
    situacao: SITUACOES.some((s) => s.value === situacao)
      ? (situacao as Situacao)
      : SITUACAO_PADRAO,
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

  if (filtros.tipoServico) q = q.eq("sites.tipo_servico_id", filtros.tipoServico);
  if (filtros.grupoSite) q = q.eq("sites.grupo_site_id", filtros.grupoSite);
  // "todos" nao filtra -- e a unica das tres opcoes que nao vira clausula.
  if (filtros.situacao === "ativos") q = q.eq("ativo", true);
  if (filtros.situacao === "inativos") q = q.eq("ativo", false);

  return q;
}

/** O join com `sites` vira inner quando o filtro e por grupo ou por tipo de
 * servico: filtrar dentro de um embed opcional nao restringe a consulta de
 * cima. */
function precisaSite(filtros: Omit<QrCodeFiltros, "pagina">): boolean {
  return Boolean(filtros.grupoSite || filtros.tipoServico);
}

export async function getQrCodes(filtros: QrCodeFiltros): Promise<{
  rows: QrCodeRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

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

  return resultadoExportacao((data ?? []) as unknown as QrCodeRow[]);
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
export async function getOpcoes(): Promise<{
  sites: Opcao[];
  gruposSites: Opcao[];
  tiposServico: Opcao[];
}> {
  const supabase = await createClient();

  const [sites, grupos, tipos] = await Promise.all([
    supabase.from("sites").select("id, nome").order("nome"),
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("tipos_servico").select("id, nome").order("nome"),
  ]);

  return {
    sites: (sites.data ?? []).map((site) => ({ value: String(site.id), label: site.nome })),
    gruposSites: (grupos.data ?? []).map((grupo) => ({
      value: String(grupo.id),
      label: grupo.nome,
    })),
    tiposServico: (tipos.data ?? []).map((tipo) => ({ value: String(tipo.id), label: tipo.nome })),
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
