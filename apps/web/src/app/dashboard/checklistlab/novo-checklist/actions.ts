"use server";

import { revalidatePath } from "next/cache";
import { tipoDeResposta, respostasDoTipo, type TipoDeResposta } from "@projeto-renatoo/shared";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * "Novo Checklist" pelo portal, como no sistema de referencia: quem esta no
 * escritorio responde um checklist sem o app.
 *
 * Tres passos, com o navegador no meio para a assinatura (que sobe direto ao
 * bucket `checklists`, como a do app):
 *   1) `abrirVisitaDoPortal` cria a visita da pessoa no site;
 *   2) o navegador envia a assinatura para `<visita>/assinatura.png`;
 *   3) `enviarChecklistDoPortal` grava pelo mesmo `registrar_checklist` do app.
 * Se o 2 ou o 3 falham, `desistirDaVisita` apaga a visita vazia
 * (`abandonar_visita`, 0088) para nao sobrar visita sem checklist.
 */

export type PerguntaDoPortal = { id: number; ordem: number; texto: string; tipo: TipoDeResposta; grupo: string | null };

export async function lerPerguntasDoModelo(modeloId: number): Promise<PerguntaDoPortal[] | null> {
  if (!Number.isSafeInteger(modeloId) || modeloId <= 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("perguntas_checklist")
    .select("id, ordem, texto, tipo_resposta, grupos_perguntas ( nome )")
    .eq("modelo_id", modeloId)
    .eq("ativo", true)
    .order("ordem");
  if (error) return null;
  return (data ?? []).map((p) => ({
    id: p.id,
    ordem: p.ordem,
    texto: p.texto,
    tipo: tipoDeResposta(p.tipo_resposta),
    grupo: p.grupos_perguntas?.nome ?? null,
  }));
}

export async function abrirVisitaDoPortal(siteId: number): Promise<{ visitaId: number } | { erro: string }> {
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return { erro: "Escolha o site." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };

  const { data, error } = await supabase
    .from("visitas")
    .insert({ numero_coleta: crypto.randomUUID(), site_id: siteId, funcionario_id: user.id })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error && error.code !== "42501") erro(gerarIdDeRequisicao(), "Novo Checklist: falha ao abrir visita:", error.message);
    return { erro: error?.code === "42501" ? "Sua conta não pode registrar visita neste site." : "Não foi possível abrir a visita." };
  }
  return { visitaId: data.id };
}

export type RespostaDoPortal = { perguntaId: number; resposta: string; observacao: string };

export async function enviarChecklistDoPortal(entrada: {
  visitaId: number;
  modeloId: number;
  assinaturaPath: string;
  respostas: RespostaDoPortal[];
  perguntas: PerguntaDoPortal[];
}): Promise<{ erro?: string }> {
  const { visitaId, modeloId, assinaturaPath, respostas, perguntas } = entrada;
  if (!Number.isSafeInteger(visitaId) || !Number.isSafeInteger(modeloId)) return { erro: "Checklist inválido." };
  if (assinaturaPath !== `${visitaId}/assinatura.png`) return { erro: "Assinatura inválida." };

  // Toda pergunta respondida, com uma resposta do tipo dela -- a mesma regra
  // da tela do app (`pendencias-do-checklist.ts`).
  const porId = new Map(respostas.map((r) => [r.perguntaId, r]));
  for (const pergunta of perguntas) {
    const r = porId.get(pergunta.id);
    if (!r || !respostasDoTipo(pergunta.tipo).includes(r.resposta as never)) {
      return { erro: `Responda a pergunta ${pergunta.ordem}.` };
    }
    if (r.observacao.length > 2000) return { erro: `A observação da pergunta ${pergunta.ordem} passou de 2000 caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_checklist", {
    p_visita_id: visitaId,
    p_tipo: "CONSULTORIA",
    p_motivo: "",
    p_assinatura_path: assinaturaPath,
    p_fotos: [],
    p_respostas: perguntas.map((p) => ({
      pergunta_id: p.id,
      resposta: porId.get(p.id)!.resposta,
      observacao: porId.get(p.id)!.observacao.trim(),
    })),
    p_modelo_id: modeloId,
  });
  if (error) {
    erro(gerarIdDeRequisicao(), "Novo Checklist: falha ao registrar:", error.message);
    return { erro: "Não foi possível enviar o checklist. Tente de novo." };
  }
  revalidatePath("/dashboard/checklistlab/historico-de-checklist");
  return {};
}

export async function desistirDaVisita(visitaId: number): Promise<void> {
  if (!Number.isSafeInteger(visitaId) || visitaId <= 0) return;
  const supabase = await createClient();
  await supabase.rpc("abandonar_visita", { p_visita_id: visitaId });
}
