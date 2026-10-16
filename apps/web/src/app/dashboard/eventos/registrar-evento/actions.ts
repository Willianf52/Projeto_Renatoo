"use server";

import { revalidatePath } from "next/cache";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerAnexos, lerRegistro } from "./regras";

const PAINEL = "/dashboard/eventos/painel-de-eventos";

export type ResultadoDoRegistro = { ok: true; id: number; numeroAno: string } | { ok: false; erro: string };

/**
 * Registrar Evento (migration 0072). Devolve o id em vez de redirecionar: os
 * arquivos sobem DEPOIS, do navegador direto ao Storage, na pasta da
 * ocorrencia que acabou de nascer (a policy do bucket exige que ela exista).
 * Mesmo motivo do Painel: a Vercel limita o corpo da funcao a 4,5 MB.
 */
export async function registrarEvento(formData: FormData): Promise<ResultadoDoRegistro> {
  const lido = lerRegistro(formData);
  if (!lido.ok) return lido;
  const d = lido.dados;

  if (!(await podeConfigurarEventos())) return { ok: false, erro: "Somente o Gestor registra eventos." };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("registrar_ocorrencia_manual", {
    p_site_id: d.siteId,
    p_evento_id: d.eventoId,
    p_subevento_id: d.subeventoId ?? undefined,
    p_classificacao_id: d.classificacaoId ?? undefined,
    p_observacao: d.observacao ?? undefined,
  });

  if (error || id === null) {
    if (error?.code === "42501") return { ok: false, erro: "Somente o Gestor registra eventos." };
    // 23514 e P0001 (bloqueio de repeticao): frases da propria funcao, ja em
    // portugues e sem nada interno.
    if (error && (error.code === "23514" || error.code === "P0001")) return { ok: false, erro: error.message };
    registrarErro(gerarIdDeRequisicao(), "Registrar Evento: falha ao registrar:", error);
    return { ok: false, erro: "Não foi possível registrar. Tente de novo." };
  }

  const { data: criada } = await supabase.from("ocorrencias").select("numero, ano").eq("id", id).maybeSingle();

  revalidatePath(PAINEL);
  return { ok: true, id, numeroAno: criada ? `${criada.numero}/${criada.ano}` : String(id) };
}

/** Grava os arquivos ja enviados ao bucket. A policy da 0072 so aceita do
 * autor da ocorrencia manual, na primeira hora. */
export async function anexarArquivosDaAbertura(ocorrenciaId: number, enviadosJson: string): Promise<{ erro?: string }> {
  if (!Number.isSafeInteger(ocorrenciaId) || ocorrenciaId <= 0) return { erro: "Ocorrência inválida." };

  let bruto: unknown;
  try {
    bruto = JSON.parse(enviadosJson);
  } catch {
    return { erro: "Anexos inválidos." };
  }
  const anexos = lerAnexos(ocorrenciaId, bruto);
  if (!anexos) return { erro: "Anexos inválidos." };

  const supabase = await createClient();
  // Um insert, uma instrucao: entram todos ou nenhum.
  const { error } = await supabase.from("ocorrencia_arquivos").insert(
    anexos.map((a) => ({ ocorrencia_id: ocorrenciaId, storage_path: a.storage_path, nome_original: a.nome })),
  );
  if (error) {
    registrarErro(gerarIdDeRequisicao(), "Registrar Evento: falha ao gravar os anexos:", error);
    return { erro: "Os arquivos subiram, mas não foi possível ligá-los à ocorrência." };
  }

  revalidatePath(`${PAINEL}/${ocorrenciaId}`);
  return {};
}
