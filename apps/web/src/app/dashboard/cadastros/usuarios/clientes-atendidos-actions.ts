"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Clientes (grupos de sites) que a pessoa atende (0113). Salva a lista
 * inteira de uma vez pela funcao transacional; quem pode (o GESTOR) e o banco
 * que decide.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function salvarClientesAtendidos(usuarioId: string, grupos: number[]): Promise<{ erro?: string }> {
  if (!UUID.test(usuarioId)) return { erro: "Usuário inválido." };
  const ids = [...new Set(grupos)].filter((g) => Number.isSafeInteger(g) && g > 0);

  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_clientes_atendidos", { p_usuario_id: usuarioId, p_grupos: ids });
  if (error) {
    return {
      erro: error.code === "42501" ? "Só o gestor edita os clientes atendidos." : "Não foi possível salvar. Tente novamente.",
    };
  }
  revalidatePath(`/dashboard/cadastros/usuarios/${usuarioId}/editar`);
  return {};
}
