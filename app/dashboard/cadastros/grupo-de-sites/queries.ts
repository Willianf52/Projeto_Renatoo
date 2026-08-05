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

export async function getGruposSites(filtros: GrupoSiteFiltros): Promise<{
  rows: GrupoSiteRow[];
  totalItems: number;
}> {
  const supabase = await createClient();

  const pagina = Math.max(1, filtros.pagina);
  const from = (pagina - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("grupos_sites")
    .select("id, nome, descricao, ativo", { count: "exact" })
    // Sem desempate de proposito: `grupos_sites.nome` e `not null unique`
    // (migration 0003), entao esta ordenacao ja e total e a paginacao nao
    // repete nem pula linha. Se a restricao de unicidade cair, um
    // `.order("id")` passa a ser necessario aqui.
    .order("nome", { ascending: true })
    .range(from, to);

  // Busca livre: um campo so, procurando em nome e descricao, como na tela
  // antiga. Quem digita "portaria" espera achar tambem o grupo cuja descricao
  // menciona portaria.
  if (filtros.busca) {
    const termo = termoParaOr(filtros.busca);
    query = query.or(`nome.ilike."%${termo}%",descricao.ilike."%${termo}%"`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as GrupoSiteRow[], totalItems: count ?? 0 };
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
