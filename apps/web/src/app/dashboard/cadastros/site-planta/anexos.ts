"use server";

import { revalidatePath } from "next/cache";
import { caminhoValido } from "@/app/dashboard/eventos/painel-de-eventos/andamentos";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

/**
 * Anexos do Site/Planta (0089), como a aba "Anexos" do sistema de referencia.
 *
 * O arquivo vai do navegador direto ao bucket `sites` (o limite de corpo de
 * funcao da Vercel e menor que os 10 MB aceitos), com a sessao da pessoa; so o
 * caminho chega aqui, conferido de novo, para gravar a linha. Mesmo desenho
 * dos anexos das ocorrencias.
 */

const editar = (siteId: number) => `/dashboard/cadastros/site-planta/${siteId}/editar`;

export async function registrarAnexoDoSite(siteId: number, caminho: string, nome: string): Promise<{ erro?: string }> {
  if (!Number.isSafeInteger(siteId) || siteId <= 0 || !caminhoValido(siteId, caminho)) return { erro: "Arquivo inválido." };
  const nomeLimpo = nome.trim().slice(0, 200);
  if (!nomeLimpo) return { erro: "Arquivo inválido." };
  if (!(await podeAdministrarCadastros())) return { erro: "Sua conta não pode anexar arquivos ao site." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_anexos")
    .insert({ site_id: siteId, storage_path: caminho, nome_original: nomeLimpo });
  if (error) {
    erro(gerarIdDeRequisicao(), "Site/Planta: falha ao registrar anexo:", error.message);
    return { erro: "Não foi possível salvar o anexo. Tente de novo." };
  }
  revalidatePath(editar(siteId));
  return {};
}

export async function removerAnexoDoSite(anexoId: number): Promise<{ erro?: string }> {
  if (!Number.isSafeInteger(anexoId) || anexoId <= 0) return { erro: "Anexo inválido." };
  if (!(await podeAdministrarCadastros())) return { erro: "Sua conta não pode remover anexos." };

  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("site_anexos")
    .select("id, site_id, storage_path")
    .eq("id", anexoId)
    .maybeSingle();
  if (!anexo) return { erro: "Anexo não encontrado." };

  const { data: removido, error } = await supabase.from("site_anexos").delete().eq("id", anexoId).select("id").maybeSingle();
  if (error || !removido) return { erro: "Não foi possível remover o anexo. Tente de novo." };
  // O arquivo sai depois da linha: se falhar, sobra um objeto sem linha (sem
  // acesso pela tela), e nao uma linha apontando para o nada.
  await supabase.storage.from("sites").remove([anexo.storage_path]);

  revalidatePath(editar(anexo.site_id));
  return {};
}
