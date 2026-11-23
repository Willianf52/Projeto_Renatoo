import { createClient } from "@/lib/supabase/server";

/**
 * Leituras do cadastro de veiculos (0104), todas pela sessao: o RLS ja
 * recorta (CLIENTE nao ve nada).
 */

export const PAGE_SIZE = 20;

export type VeiculoFiltros = { busca?: string; status?: string; pagina: number };

export type Veiculo = {
  id: number;
  placa: string;
  modelo: string;
  cor: string;
  empresa: string;
  km_atual: number;
  km_ultima_revisao: number;
  ativo: boolean;
};

export type Opcao = { value: string; label: string };

const COLUNAS = "id, placa, modelo, cor, empresa, km_atual, km_ultima_revisao, ativo";

/** A busca entra num `or` do PostgREST: so letras, numeros, espaco e hifen. */
function buscaSegura(busca: string | undefined): string | null {
  const limpa = (busca ?? "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
  return limpa === "" ? null : limpa;
}

export async function getVeiculos(filtros: VeiculoFiltros): Promise<{ rows: Veiculo[]; totalItems: number }> {
  const supabase = await createClient();
  let consulta = supabase.from("veiculos").select(COLUNAS, { count: "exact" }).order("placa");

  const busca = buscaSegura(filtros.busca);
  if (busca) {
    const placa = busca.toUpperCase().replace(/[\s-]/g, "");
    consulta = consulta.or(`placa.ilike.%${placa}%,modelo.ilike.%${busca}%,empresa.ilike.%${busca}%`);
  }
  if (filtros.status === "ativo") consulta = consulta.eq("ativo", true);
  if (filtros.status === "inativo") consulta = consulta.eq("ativo", false);

  const inicio = (filtros.pagina - 1) * PAGE_SIZE;
  const { data, count, error } = await consulta.range(inicio, inicio + PAGE_SIZE - 1);
  if (error) throw new Error(`Veículos: falha ao listar: ${error.message}`);
  return { rows: data ?? [], totalItems: count ?? 0 };
}

export async function getVeiculo(id: number): Promise<Veiculo | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("veiculos").select(COLUNAS).eq("id", id).maybeSingle();
  return data;
}

/** Nome de cada pessoa por id, para a coluna "Registrado por". */
export async function nomesDasPessoas(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unicos.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, nome_completo").in("id", unicos);
  return new Map((data ?? []).map((p) => [p.id, p.nome_completo ?? ""]));
}

export type RegistroDeKm = { id: number; km: number; registrado_em: string; registrado_por: string };
export type Manutencao = {
  id: number;
  data: string;
  tipo: string;
  km: number | null;
  descricao: string;
  registrado_por: string;
};

/** Os ultimos registros de km e de manutencao do veiculo, mais novos primeiro. */
export async function getHistorico(
  veiculoId: number,
): Promise<{ km: RegistroDeKm[]; manutencoes: Manutencao[] }> {
  const supabase = await createClient();
  const [km, manutencoes] = await Promise.all([
    supabase
      .from("veiculo_km")
      .select("id, km, registrado_em, registrado_por")
      .eq("veiculo_id", veiculoId)
      .order("registrado_em", { ascending: false })
      .limit(50),
    supabase
      .from("veiculo_manutencoes")
      .select("id, data, tipo, km, descricao, registrado_por")
      .eq("veiculo_id", veiculoId)
      .order("data", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
  ]);
  return { km: km.data ?? [], manutencoes: manutencoes.data ?? [] };
}
