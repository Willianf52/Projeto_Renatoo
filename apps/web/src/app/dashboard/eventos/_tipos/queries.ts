import { createClient } from "@/lib/supabase/server";
import { CADASTROS, type TipoDeCadastro } from "./config";

export type LinhaDoTipo = { id: number; nome: string; cor: string | null; ativo: boolean };

/**
 * As duas tabelas tem o mesmo formato (0064 + 0071). O cliente tipado do
 * Supabase nao resolve `.from()` com uma uniao de nomes, entao o nome vai como
 * o de uma delas -- as colunas lidas existem nas duas.
 */
function tabela(tipo: TipoDeCadastro) {
  return CADASTROS[tipo].tabela as "tipos_de_analise";
}

/** Sem paginacao: sao poucos tipos (a referencia tem um ou dois de cada). */
export async function listarTipos(tipo: TipoDeCadastro): Promise<LinhaDoTipo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from(tabela(tipo))
    .select("id, nome, cor, ativo")
    .order("nome", { ascending: true });
  return data ?? [];
}

export async function buscarTipo(tipo: TipoDeCadastro, id: number): Promise<LinhaDoTipo | null> {
  const supabase = await createClient();
  const { data } = await supabase.from(tabela(tipo)).select("id, nome, cor, ativo").eq("id", id).maybeSingle();
  return data;
}
