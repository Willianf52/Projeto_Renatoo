import { createClient } from "@/lib/supabase/server";
import { termoParaOr } from "@/lib/postgrest-escape";
import { paginar } from "@/lib/supabase/query-helpers";

export const PAGE_SIZE = 25;

export type ModeloFiltros = {
  busca?: string;
  /** "ativo" | "inativo" | undefined (todos). */
  status?: string;
  pagina: number;
};

export type ModeloRow = {
  id: number;
  nome: string;
  padrao: boolean;
  ativo: boolean;
  /** Os NOMES dos grupos, como a coluna "Usuários" de Grupo de Usuários: o que
   * a tela precisa responder e QUAIS lugares respondem este modelo. */
  grupos: string[];
  perguntas: number;
};

type LinhaBruta = {
  id: number;
  nome: string;
  padrao: boolean;
  ativo: boolean;
  modelos_checklist_grupos: { grupos_sites: { nome: string } | null }[];
  perguntas_checklist: { count: number }[];
};

const COLUNAS =
  "id, nome, padrao, ativo, modelos_checklist_grupos ( grupos_sites ( nome ) ), perguntas_checklist ( count )";

function paraLinha(bruta: LinhaBruta): ModeloRow {
  return {
    id: bruta.id,
    nome: bruta.nome,
    padrao: bruta.padrao,
    ativo: bruta.ativo,
    grupos: bruta.modelos_checklist_grupos
      .map((ligacao) => ligacao.grupos_sites?.nome)
      .filter((nome): nome is string => Boolean(nome))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    perguntas: bruta.perguntas_checklist[0]?.count ?? 0,
  };
}

export async function getModelos(filtros: ModeloFiltros): Promise<{
  rows: ModeloRow[];
  totalItems: number;
}> {
  const supabase = await createClient();
  const { from, to } = paginar(filtros.pagina, PAGE_SIZE);

  let query = supabase
    .from("modelos_checklist")
    .select(COLUNAS, { count: "exact" })
    // O padrao primeiro: e o que vale para todo grupo sem modelo, e quem abre
    // a tela precisa ve-lo antes de concluir que um grupo "nao tem checklist".
    // Sem outro desempate: `nome` e unico (indice da 0061).
    .order("padrao", { ascending: false })
    .order("nome", { ascending: true })
    .range(from, to);

  if (filtros.status === "ativo") query = query.eq("ativo", true);
  if (filtros.status === "inativo") query = query.eq("ativo", false);
  if (filtros.busca) query = query.or(`nome.ilike."%${termoParaOr(filtros.busca)}%"`);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: ((data ?? []) as unknown as LinhaBruta[]).map(paraLinha),
    totalItems: count ?? 0,
  };
}

export type ModeloEmEdicao = {
  id: number;
  nome: string;
  padrao: boolean;
  ativo: boolean;
  grupos: string[];
};

export async function getModelo(id: number): Promise<ModeloEmEdicao | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modelos_checklist")
    .select("id, nome, padrao, ativo, modelos_checklist_grupos ( grupo_site_id )")
    .eq("id", id)
    // `maybeSingle`: id que nao existe e 404 da tela, nao erro do Postgres.
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    padrao: data.padrao,
    ativo: data.ativo,
    grupos: data.modelos_checklist_grupos.map((ligacao) => String(ligacao.grupo_site_id)),
  };
}

export type Opcao = { value: string; label: string };

/**
 * Todos os grupos, ativos ou nao: um modelo ligado a um grupo que foi
 * desativado depois precisa continuar aparecendo marcado na edicao -- sumir da
 * lista faria o proximo "Salvar" desligar o grupo sem ninguem pedir.
 */
export async function getOpcoesDeGrupos(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("grupos_sites")
    .select("id, nome, ativo")
    .order("nome", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((grupo) => ({
    value: String(grupo.id),
    label: grupo.ativo ? grupo.nome : `${grupo.nome} (inativo)`,
  }));
}

/**
 * Modelos para os selects de Perguntas do Checklist, o padrao primeiro.
 * Inativos entram marcados como tal: perguntas de modelo desligado continuam
 * existindo e precisam ser filtraveis.
 */
export async function getOpcoesDeModelos(): Promise<(Opcao & { padrao: boolean })[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("modelos_checklist")
    .select("id, nome, padrao, ativo")
    .order("padrao", { ascending: false })
    .order("nome", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((modelo) => ({
    value: String(modelo.id),
    label: modelo.ativo ? modelo.nome : `${modelo.nome} (inativo)`,
    padrao: modelo.padrao,
  }));
}

/** O que vai em "Grupos" quando o modelo e o padrao: ele nao se liga a grupo,
 * vale para os que nao tem modelo. */
export const GRUPOS_DO_PADRAO = "Todo grupo sem modelo próprio";

/** Colunas de texto da linha; a coluna "Ações" e montada na pagina. */
export function toTableRow(modelo: ModeloRow): string[] {
  return [
    modelo.padrao ? `${modelo.nome} (padrão)` : modelo.nome,
    modelo.padrao ? GRUPOS_DO_PADRAO : modelo.grupos.join(", "),
    String(modelo.perguntas),
    modelo.ativo ? "Ativo" : "Inativo",
  ];
}
