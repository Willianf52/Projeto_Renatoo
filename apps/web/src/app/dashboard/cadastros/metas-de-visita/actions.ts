"use server";

import { revalidatePath } from "next/cache";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { ehPeriodo, lerDataDeInicio } from "./periodos";

/**
 * Gravacoes das metas de visita (0105/0106). Quem pode mora no RLS (quem
 * administra cadastros). Salvar a mesma pessoa, lugar e periodo troca a meta
 * existente, em vez de recusar por duplicidade: e o jeito de "editar" sem
 * tela a mais.
 */

const TELA = "/dashboard/cadastros/metas-de-visita";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAGENS = {
  duplicado: "Essa pessoa já tem meta nesse lugar e período.",
  semPermissao: "Você não tem permissão para cadastrar metas.",
  fkInvalida: "A pessoa ou o lugar escolhido não existe mais.",
  generico: "Não foi possível salvar a meta. Tente novamente.",
};

export type EstadoDaMeta = { erro?: string; ok?: string };

export async function salvarMeta(_estado: EstadoDaMeta, formData: FormData): Promise<EstadoDaMeta> {
  const usuarioId = texto(formData, "usuario_id");
  const siteId = Number(texto(formData, "site_id"));
  const periodo = texto(formData, "periodo");
  const quantidade = Number(texto(formData, "quantidade"));
  const iniciaEm = lerDataDeInicio(texto(formData, "inicia_em"));

  if (!UUID.test(usuarioId)) return { erro: "Escolha a pessoa." };
  if (!Number.isSafeInteger(siteId) || siteId <= 0) return { erro: "Escolha o lugar." };
  if (!ehPeriodo(periodo)) return { erro: "Escolha o período." };
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 200) {
    return { erro: "A meta deve ser de 1 a 200 visitas." };
  }
  // Na quinzenal, a data ancora os blocos de 15 dias corridos (0107).
  if (!iniciaEm) return { erro: "Informe a data de início." };

  const supabase = await createClient();
  const { data: existente } = await supabase
    .from("metas_de_visita")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("site_id", siteId)
    .eq("periodo", periodo)
    .maybeSingle();

  if (existente) {
    const resultado = await supabase
      .from("metas_de_visita")
      .update({ quantidade, ativo: true, inicia_em: iniciaEm })
      .eq("id", existente.id)
      .select("id")
      .maybeSingle();
    const verificacao = verificarEscritaComRls(resultado, MENSAGENS, "Você não tem permissão para editar esta meta.");
    if (!verificacao.ok) return { erro: verificacao.erro };
    revalidatePath(TELA);
    return { ok: "Meta atualizada." };
  }

  const { error } = await supabase
    .from("metas_de_visita")
    .insert({ usuario_id: usuarioId, site_id: siteId, periodo, quantidade, inicia_em: iniciaEm });
  if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS) };

  revalidatePath(TELA);
  return { ok: "Meta cadastrada." };
}

export async function excluirMeta(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const supabase = await createClient();
  // Barrada pelo RLS, apaga zero linhas: a lista simplesmente nao muda.
  await supabase.from("metas_de_visita").delete().eq("id", id);
  revalidatePath(TELA);
}
