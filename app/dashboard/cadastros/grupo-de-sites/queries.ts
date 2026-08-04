import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 25;

export const SITUACOES = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

export type GrupoSiteFiltros = {
  nome?: string;
  situacao?: "ativos" | "inativos";
  pagina: number;
};

type GrupoSiteRow = {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
  /** Lista de um elemento na forma documentada; o objeto direto aparece
   * conforme a versao do PostgREST. Ver extrairContagem. */
  sites: { count: number }[] | { count: number } | null;
};

/**
 * A contagem do embed chega como [{ count: n }] ou { count: n } dependendo da
 * versao do PostgREST. Ler so a primeira forma faria a coluna exibir zero em
 * todos os grupos na outra -- numero errado e plausivel, que ninguem
 * questionaria.
 */
function extrairContagem(sites: GrupoSiteRow["sites"]): number {
  if (!sites) return 0;
  const registro = Array.isArray(sites) ? sites[0] : sites;
  return registro?.count ?? 0;
}

/**
 * Neutraliza os curingas do LIKE. Sem isto, um "%" digitado na busca casaria
 * com qualquer coisa e um "_" com qualquer caractere -- a pessoa procura por
 * um nome e recebe a lista inteira, sem entender por que.
 */
const escaparLike = (valor: string) => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function getGruposSites(filtros: GrupoSiteFiltros): Promise<{
  rows: GrupoSiteRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // sites(count) resolve a quantidade de unidades no proprio banco. Trazer os
  // sites so para conta-los no servidor puxaria toda a tabela sem necessidade.
  let query = supabase
    .from("grupos_sites")
    .select("id, nome, descricao, ativo, criado_em, sites(count)", { count: "exact" })
    .order("nome", { ascending: true })
    .range(from, to);

  if (filtros.situacao) query = query.eq("ativo", filtros.situacao === "ativos");
  if (filtros.nome) query = query.ilike("nome", `%${escaparLike(filtros.nome)}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as unknown as GrupoSiteRow[], totalItems: count ?? 0 };
}

function formatarData(valor: string | null): string {
  if (!valor) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(valor));
}

export function toTableRow(grupo: GrupoSiteRow): string[] {
  return [
    grupo.nome,
    grupo.descricao ?? "",
    String(extrairContagem(grupo.sites)),
    grupo.ativo ? "Ativo" : "Inativo",
    formatarData(grupo.criado_em),
  ];
}
