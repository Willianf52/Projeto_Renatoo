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

/**
 * Chama `pode_administrar_cadastros()` (migration 0009) direto via RPC, em vez
 * de reimplementar a regra em TS a partir de `cargo`/`ativo`. Serve so para a
 * interface decidir entre mostrar o botao e mostra-lo desabilitado -- quem
 * autoriza de verdade e o RLS, no banco -- mas antes disto a lista de cargos
 * vivia duplicada em TS e em SQL, sem nada impedindo as duas de divergirem. A
 * funcao e `security definer`, estavel e ja tem `grant execute` para
 * `authenticated`, entao chamar direto e uma fonte so e um round-trip em vez
 * de dois (`getUser()` + `select`).
 */
export async function podeAdministrarCadastros(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pode_administrar_cadastros");

  if (error) {
    console.error("Falha ao verificar permissão de administrar cadastros:", error.message);
    return false;
  }

  return Boolean(data);
}

export async function getGrupoSite(id: number): Promise<GrupoSiteRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos_sites")
    .select("id, nome, descricao, ativo")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(grupo: GrupoSiteRow): string[] {
  return [String(grupo.id), grupo.nome, grupo.ativo ? "Ativo" : "Inativo", grupo.descricao ?? ""];
}
