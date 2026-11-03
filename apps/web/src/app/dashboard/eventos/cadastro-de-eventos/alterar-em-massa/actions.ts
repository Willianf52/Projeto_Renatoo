"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { texto } from "@/lib/form-data";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { LISTAGEM } from "../regras";

export type EstadoDaAlteracao = { erro?: string };

const ID = /^[1-9]\d{0,17}$/;

/**
 * "Alterar Eventos" do sistema de referencia (0083): Grupo Responsavel e
 * Sites de varios eventos de uma vez. "manter" adiciona aos sites que cada
 * evento ja tem; "substituir" deixa so os escolhidos. Quem pode e o banco
 * que decide (policies da 0072, pela funcao `security invoker`).
 */
export async function alterarEventosEmMassa(
  _estado: EstadoDaAlteracao,
  formData: FormData,
): Promise<EstadoDaAlteracao> {
  const eventos = formData.getAll("eventos").map(String).filter(Boolean);
  const sites = formData.getAll("sites").map(String).filter(Boolean);
  const grupo = texto(formData, "grupo_responsavel_id");
  const acao = texto(formData, "acao");

  if (eventos.length === 0) return { erro: "Escolha ao menos um evento." };
  if (![...eventos, ...sites].every((id) => ID.test(id)) || (grupo && !ID.test(grupo))) {
    return { erro: "Seleção inválida." };
  }
  if (acao !== "manter" && acao !== "substituir") return { erro: "Escolha o que fazer com as permissões atuais." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("alterar_eventos_em_massa", {
    p_eventos: eventos.map(Number),
    p_sites: sites.map(Number),
    // O tipo gerado nao marca o parametro que aceita nulo; a funcao aceita.
    p_grupo_responsavel_id: (grupo ? Number(grupo) : null) as number,
    p_substituir: acao === "substituir",
  });

  if (error) {
    if (error.code === "42501") return { erro: "Somente o Gestor altera eventos." };
    if (error.code === "22023") return { erro: error.message };
    registrarErro(gerarIdDeRequisicao(), "Alterar Eventos em massa: falha:", error);
    return { erro: "Não foi possível alterar. Tente de novo." };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
