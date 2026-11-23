import { createClient } from "@/lib/supabase/server";

/**
 * Foto do usuario (0112). Fica no bucket PRIVADO `fotos-de-usuario`, em
 * `<id>/foto`; a tela so recebe um link assinado de 1 hora. Quem pode ver
 * (a propria pessoa e o GESTOR) e decidido pelo RLS: sem permissao, nao ha
 * linha em `fotos_de_usuario` nem link, e a tela mostra o boneco.
 */

import { BUCKET_DAS_FOTOS, caminhoDaFoto } from "./foto-do-usuario-cliente";

export { BUCKET_DAS_FOTOS, caminhoDaFoto, problemaDaFoto } from "./foto-do-usuario-cliente";

/** Link temporario da foto, ou `null` se a pessoa nao tem foto (ou nao pode ver). */
export async function linkDaFoto(usuarioId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("fotos_de_usuario")
    .select("atualizada_em")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (!registro) return null;

  const { data } = await supabase.storage.from(BUCKET_DAS_FOTOS).createSignedUrl(caminhoDaFoto(usuarioId), 60 * 60);
  if (!data?.signedUrl) return null;
  // A versao no fim faz o navegador buscar a foto nova logo depois da troca.
  const versao = new Date(registro.atualizada_em).getTime();
  return `${data.signedUrl}&v=${versao}`;
}
