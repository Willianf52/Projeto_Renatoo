"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { idValido } from "./queries";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

export type EstadoDaExclusao = { erro?: string };

/**
 * "Excluir checklist" (migration 0066): exclusao fisica, como no sistema
 * antigo. Quem decide e o banco -- a policy de DELETE (so GESTOR) e o trigger
 * que recusa checklist com ocorrencia ja tratada; a checagem de cargo aqui so
 * poupa a viagem e da a mensagem certa.
 *
 * OS ARQUIVOS (assinatura e fotos) nao saem por cascata: o Storage nao tem
 * policy de DELETE no bucket `checklists`, de proposito (0042). Os caminhos
 * sao lidos ANTES do DELETE, com a sessao de quem pede, e so removidos com a
 * service_role DEPOIS de o banco confirmar que a linha saiu -- entao a chave
 * que ignora o RLS so apaga o que o RLS acabou de deixar excluir. Falha nessa
 * etapa vai para o log com os caminhos: o checklist ja nao existe, e repetir
 * a exclusao nao teria o que achar.
 */
export async function excluirChecklist(
  _estado: EstadoDaExclusao,
  formData: FormData,
): Promise<EstadoDaExclusao> {
  const id = idValido(String(formData.get("checklist_id") ?? ""));
  if (id === null) return { erro: "Checklist inválido." };

  if (!(await podeAdministrarUsuarios())) {
    return { erro: "Sua conta não pode excluir checklists." };
  }

  const supabase = await createClient();
  const { data: midia, error: erroDeLeitura } = await supabase
    .from("checklists_visita")
    .select("assinatura_path, checklist_fotos ( storage_path )")
    .eq("id", id)
    .maybeSingle();

  if (erroDeLeitura) {
    erro(gerarIdDeRequisicao(), "Falha ao ler o checklist a excluir:", erroDeLeitura.message);
    return { erro: "Não foi possível excluir o checklist. Tente de novo." };
  }
  if (!midia) return { erro: "Checklist não encontrado. Ele pode já ter sido excluído." };

  const { data: excluidos, error } = await supabase
    .from("checklists_visita")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === "23514") {
      return { erro: "Este checklist tem ocorrência já analisada ou finalizada e não pode ser excluído." };
    }
    erro(gerarIdDeRequisicao(), "Falha ao excluir o checklist:", error.message);
    return { erro: "Não foi possível excluir o checklist. Tente de novo." };
  }
  // Sem erro e sem linha: a policy nao deixou alcancar o checklist.
  if (!excluidos?.length) return { erro: "Sua conta não pode excluir este checklist." };

  const caminhos = [midia.assinatura_path, ...(midia.checklist_fotos ?? []).map((foto) => foto.storage_path)].filter(
    (caminho): caminho is string => Boolean(caminho),
  );
  if (caminhos.length > 0) {
    try {
      const { error: erroNoStorage } = await createAdminClient().storage.from("checklists").remove(caminhos);
      if (erroNoStorage) throw erroNoStorage;
    } catch (falha) {
      erro(gerarIdDeRequisicao(), `Checklist ${id} excluído, mas os arquivos ficaram no Storage: ${caminhos.join(", ")}`, falha);
    }
  }

  // Volta para a listagem com os mesmos filtros. Relido por `URLSearchParams`:
  // o campo vem do formulario e so pode virar querystring, nunca caminho.
  const filtros = new URLSearchParams(String(formData.get("filtros") ?? ""));
  filtros.set("salvo", "1");

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?${filtros.toString()}`);
}
