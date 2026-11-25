import { createClient } from "@/lib/supabase/server";

type Opcao = { value: string; label: string };

/**
 * As duas listas da tela: grupos de sites e locais. Todos, ativos ou nao,
 * como no Site/Planta (`getOpcoes`): o cadastro de um local desativado tambem
 * pode precisar de correcao.
 */
export async function getOpcoesDaAlteracaoEmMassa(): Promise<{ grupos: Opcao[]; locais: Opcao[] }> {
  const supabase = await createClient();

  const [grupos, locais] = await Promise.all([
    supabase.from("grupos_sites").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome").order("nome").limit(5000),
  ]);

  if (grupos.error) throw grupos.error;
  if (locais.error) throw locais.error;

  return {
    grupos: (grupos.data ?? []).map((g) => ({ value: String(g.id), label: g.nome })),
    locais: (locais.data ?? []).map((s) => ({ value: String(s.id), label: s.nome })),
  };
}
