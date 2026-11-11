import { createClient } from "@/lib/supabase/server";
import type { Situacao } from "./regras";

export type GrupoDePerguntas = {
  id: number;
  nome: string;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  /** Quantas perguntas apontam para o grupo, ativas ou nao. */
  perguntas: number;
};

type LinhaBruta = Omit<GrupoDePerguntas, "perguntas"> & { perguntas_checklist: { count: number }[] };

/** Sem paginacao: sao dezenas de grupos (80 na referencia). Ordem, depois nome. */
export async function listarGrupos(filtros: {
  situacao: Situacao;
  /** "Nome da Atividade" do sistema de referencia: trecho do nome do grupo. */
  nome?: string;
  busca?: string;
}): Promise<GrupoDePerguntas[]> {
  const supabase = await createClient();
  let consulta = supabase
    .from("grupos_perguntas")
    .select("id, nome, cor, ordem, ativo, perguntas_checklist ( count )")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (filtros.situacao === "ativos") consulta = consulta.eq("ativo", true);
  if (filtros.situacao === "inativos") consulta = consulta.eq("ativo", false);

  const { data, error } = await consulta;
  if (error) throw error;

  // O grupo nao tem descricao (0073): a Busca Livre tambem procura no nome.
  const termo = filtros.busca?.trim().toLowerCase();
  const nome = filtros.nome?.trim().toLowerCase();
  return ((data ?? []) as unknown as LinhaBruta[])
    .map(({ perguntas_checklist, ...grupo }) => ({ ...grupo, perguntas: perguntas_checklist[0]?.count ?? 0 }))
    .filter((grupo) => !nome || grupo.nome.toLowerCase().includes(nome))
    .filter((grupo) => !termo || grupo.nome.toLowerCase().includes(termo));
}

export async function buscarGrupo(id: number): Promise<GrupoDePerguntas | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grupos_perguntas")
    .select("id, nome, cor, ordem, ativo")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, perguntas: 0 } : null;
}

/** Proxima ordem livre, para o cadastro nascer preenchido. */
export async function proximaOrdem(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grupos_perguntas")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Math.min(9999, (data?.ordem ?? 0) + 1);
}
