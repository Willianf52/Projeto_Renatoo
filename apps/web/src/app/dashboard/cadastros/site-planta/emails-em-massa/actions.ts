"use server";

import { revalidatePath } from "next/cache";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { juntarLocais, lerPedido, linhaDoUpdate, mensagemDeSucesso } from "./regras";

const LISTAGEM = "/dashboard/cadastros/site-planta";

export type EstadoDoEnvio = { erro?: string; sucesso?: string };

/**
 * Grava a mesma lista de e-mails nas colunas marcadas de todos os locais
 * escolhidos. Cliente da sessao, nao service_role: o RLS de `sites` e o
 * grant por coluna (0065, 0082) decidem quem altera, como no "Editar site".
 */
export async function alterarEmailsEmMassa(
  _estado: EstadoDoEnvio,
  formData: FormData,
): Promise<EstadoDoEnvio> {
  const leitura = lerPedido(formData);
  if (!leitura.ok) return { erro: leitura.erro };
  const { pedido } = leitura;

  if (!(await podeAdministrarCadastros())) {
    return { erro: "Você não tem permissão para alterar sites." };
  }

  const supabase = await createClient();

  let locaisDosGrupos: number[] = [];
  if (pedido.grupos.length > 0) {
    const { data, error } = await supabase.from("sites").select("id").in("grupo_site_id", pedido.grupos);
    if (error) return { erro: "Não foi possível ler os locais dos grupos. Tente novamente." };
    locaisDosGrupos = (data ?? []).map((site) => site.id);
  }

  const locais = juntarLocais(pedido.locais, locaisDosGrupos);
  if (locais.length === 0) return { erro: "Os grupos escolhidos não têm nenhum local." };

  // `.select("id")`: um UPDATE barrado pelo RLS nao da erro, so altera zero
  // linhas (ver `lib/escrita-rls.ts`). A contagem vem do que voltou.
  const { data, error } = await supabase.from("sites").update(linhaDoUpdate(pedido)).in("id", locais).select("id");
  if (error) return { erro: "Não foi possível alterar os e-mails. Tente novamente." };

  const alterados = data?.length ?? 0;
  if (alterados === 0) return { erro: "Nenhum local foi alterado: você não tem permissão para editá-los." };

  revalidatePath(LISTAGEM);
  return { sucesso: mensagemDeSucesso(alterados) };
}
