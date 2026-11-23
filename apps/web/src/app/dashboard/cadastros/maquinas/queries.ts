import { createClient } from "@/lib/supabase/server";

/**
 * Leituras das maquinas e dos acessorios e produtos (0111), pela sessao: o RLS
 * recorta (o CLIENTE ve so os sites do seu escopo).
 */

export const PAGE_SIZE = 20;

export type Opcao = { value: string; label: string };

export type MaquinaFiltros = { busca?: string; site?: string; status?: string; pagina: number };

export type Maquina = {
  id: number;
  site_id: number;
  modelo: string;
  patrimonio: string;
  descricao: string;
  ativo: boolean;
};

const COLUNAS = "id, site_id, modelo, patrimonio, descricao, ativo";

function buscaSegura(busca: string | undefined): string | null {
  const limpa = (busca ?? "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
  return limpa === "" ? null : limpa;
}

export async function getMaquinas(filtros: MaquinaFiltros): Promise<{ rows: Maquina[]; totalItems: number }> {
  const supabase = await createClient();
  let consulta = supabase.from("maquinas").select(COLUNAS, { count: "exact" }).order("modelo").order("id");

  const busca = buscaSegura(filtros.busca);
  if (busca) consulta = consulta.or(`modelo.ilike.%${busca}%,patrimonio.ilike.%${busca}%`);
  const siteId = Number(filtros.site);
  if (Number.isSafeInteger(siteId) && siteId > 0) consulta = consulta.eq("site_id", siteId);
  if (filtros.status === "ativo") consulta = consulta.eq("ativo", true);
  if (filtros.status === "inativo") consulta = consulta.eq("ativo", false);

  const inicio = (filtros.pagina - 1) * PAGE_SIZE;
  const { data, count, error } = await consulta.range(inicio, inicio + PAGE_SIZE - 1);
  if (error) throw new Error(`Máquinas: falha ao listar: ${error.message}`);
  return { rows: data ?? [], totalItems: count ?? 0 };
}

export async function getMaquina(id: number): Promise<Maquina | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("maquinas").select(COLUNAS).eq("id", id).maybeSingle();
  return data;
}

/** Sites ativos que a pessoa enxerga, para os filtros e formularios. */
export async function getSitesParaSelecao(): Promise<Opcao[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("sites").select("id, nome").eq("ativo", true).order("nome");
  return (data ?? []).map((s) => ({ value: String(s.id), label: s.nome }));
}

export async function nomesDosSites(ids: number[]): Promise<Map<number, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("sites").select("id, nome").in("id", unicos);
  return new Map((data ?? []).map((s) => [s.id, s.nome]));
}

export async function nomesDasPessoas(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, nome_completo").in("id", unicos);
  return new Map((data ?? []).map((p) => [p.id, p.nome_completo ?? ""]));
}

export type ManutencaoDeMaquina = {
  id: number;
  data: string;
  tipo: string;
  descricao: string;
  registrado_por: string;
};

export async function getManutencoes(maquinaId: number): Promise<ManutencaoDeMaquina[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("maquina_manutencoes")
    .select("id, data, tipo, descricao, registrado_por")
    .eq("maquina_id", maquinaId)
    .order("data", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  return data ?? [];
}

export type ItemDoSite = { id: number; tipo: string; nome: string; quantidade: number; observacao: string };

export async function getItensDoSite(siteId: number): Promise<ItemDoSite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_itens")
    .select("id, tipo, nome, quantidade, observacao")
    .eq("site_id", siteId)
    .order("tipo")
    .order("nome");
  return data ?? [];
}
