"use server";

import { revalidatePath } from "next/cache";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Gravacoes das metas semanais (0105). Quem pode mora no RLS (quem administra
 * cadastros). Salvar a mesma pessoa no mesmo lugar troca a meta existente, em
 * vez de recusar por duplicidade: e o jeito de "editar" sem tela a mais.
 */

const TELA = "/dashboard/cadastros/metas-de-visita";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAGENS = {
  duplicado: "Essa pessoa já tem meta nesse lugar.",
  semPermissao: "Você não tem permissão para cadastrar metas.",
  fkInvalida: "A pessoa ou o lugar escolhido não existe mais.",
  generico: "Não foi possível salvar a meta. Tente novamente.",
};

export type EstadoDaMeta = { erro?: string; ok?: string };

export async function salvarMeta(_estado: EstadoDaMeta, formData: FormData): Promise<EstadoDaMeta> {
  const usuarioId = texto(formData, "usuario_id");
  const siteId = Number(texto(formData, "site_id"));
  const quantidade = Number(texto(formData, "visitas_por_semana"));

  if (!UUID.test(usuarioId)) return { erro: "Escolha a pessoa." };
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return { erro: "Escolha o lugar." };
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 21) {
    return { erro: "A meta deve ser de 1 a 21 visitas por semana." };
  }

  const supabase = await createClient();
  const { data: existente } = await supabase
    .from("metas_semanais")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (existente) {
    const resultado = await supabase
      .from("metas_semanais")
      .update({ visitas_por_semana: quantidade, ativo: true })
      .eq("id", existente.id)
      .select("id")
      .maybeSingle();
    const verificacao = verificarEscritaComRls(resultado, MENSAGENS, "Você não tem permissão para editar esta meta.");
    if (!verificacao.ok) return { erro: verificacao.erro };
    revalidatePath(TELA);
    return { ok: "Meta atualizada." };
  }

  const { error } = await supabase
    .from("metas_semanais")
    .insert({ usuario_id: usuarioId, site_id: siteId, visitas_por_semana: quantidade });
  if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS) };

  revalidatePath(TELA);
  return { ok: "Meta cadastrada." };
}

export async function excluirMeta(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const supabase = await createClient();
  // Barrada pelo RLS, apaga zero linhas: a lista simplesmente nao muda.
  await supabase.from("metas_semanais").delete().eq("id", id);
  revalidatePath(TELA);
}
