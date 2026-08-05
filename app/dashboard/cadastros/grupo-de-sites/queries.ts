import { createClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 25;

export type GrupoSiteFiltros = {
  busca?: string;
  pagina: number;
};

type GrupoSiteRow = {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

/**
 * Neutraliza os curingas do LIKE. Sem isto, um "%" digitado na busca casaria
 * com qualquer coisa e um "_" com qualquer caractere -- a pessoa procura por
 * um nome e recebe a lista inteira, sem entender por que.
 */
const escaparLike = (valor: string) => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Dentro de um `or(...)` o valor vai entre aspas duplas: virgula e parenteses
 * digitados na busca seriam lidos como separadores da propria expressao e
 * quebrariam a consulta. Aspa e barra invertida precisam ser escapadas para
 * nao fechar as aspas antes da hora.
 */
const escaparPostgrest = (valor: string) => valor.replace(/["\\]/g, (c) => `\\${c}`);

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
    const termo = escaparPostgrest(escaparLike(filtros.busca));
    query = query.or(`nome.ilike."%${termo}%",descricao.ilike."%${termo}%"`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: (data ?? []) as GrupoSiteRow[], totalItems: count ?? 0 };
}

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(grupo: GrupoSiteRow): string[] {
  return [String(grupo.id), grupo.nome, grupo.ativo ? "Ativo" : "Inativo", grupo.descricao ?? ""];
}
