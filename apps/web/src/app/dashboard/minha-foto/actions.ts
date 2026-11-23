"use server";

import { revalidatePath } from "next/cache";
import { BUCKET_DAS_FOTOS, caminhoDaFoto } from "@/lib/foto-do-usuario";
import { createClient } from "@/lib/supabase/server";

/**
 * Registro da foto (0112). O arquivo sobe direto do navegador para o bucket
 * privado (a action do Next aceita ate 1 MB e a foto vai ate 2 MB); aqui so a
 * linha de `fotos_de_usuario`, que diz que a foto existe e quando mudou. Quem
 * pode (a propria pessoa ou o GESTOR) e o RLS, igual ao do bucket.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registrarFoto(usuarioId: string): Promise<{ erro?: string }> {
  if (!UUID.test(usuarioId)) return { erro: "Usuário inválido." };
  const supabase = await createClient();
  const agora = new Date().toISOString();

  const { data: existente } = await supabase
    .from("fotos_de_usuario")
    .select("usuario_id")
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  const { error } = existente
    ? await supabase.from("fotos_de_usuario").update({ atualizada_em: agora }).eq("usuario_id", usuarioId)
    : await supabase.from("fotos_de_usuario").insert({ usuario_id: usuarioId, atualizada_em: agora });
  if (error) return { erro: "Não foi possível salvar a foto. Tente novamente." };

  revalidatePath("/dashboard", "layout");
  return {};
}

export async function removerFoto(usuarioId: string): Promise<{ erro?: string }> {
  if (!UUID.test(usuarioId)) return { erro: "Usuário inválido." };
  const supabase = await createClient();
  await supabase.storage.from(BUCKET_DAS_FOTOS).remove([caminhoDaFoto(usuarioId)]);
  const { error } = await supabase.from("fotos_de_usuario").delete().eq("usuario_id", usuarioId);
  if (error) return { erro: "Não foi possível remover a foto." };
  revalidatePath("/dashboard", "layout");
  return {};
}
