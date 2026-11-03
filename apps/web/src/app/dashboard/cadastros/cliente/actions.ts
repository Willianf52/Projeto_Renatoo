"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { LISTAGEM } from "./queries";

export type ValoresDoCliente = {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  ramoAtividade: string;
  ativo: boolean;
  tituloPdf: string;
  nomeFantasiaNoRemetente: boolean;
  legendaNasImagens: boolean;
  minCaracteresDescricao: string;
  minCaracteresAcoes: string;
};

export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoCliente };

const MENSAGENS = {
  duplicado: "Já existe um cadastro de cliente.",
  semPermissao: "Somente o Gestor edita o cadastro do cliente.",
  generico: "Não foi possível salvar. Tente novamente.",
};

/** Logotipo: PNG ou JPEG ate 500 KB -- abaixo do teto de 1 MB do corpo de uma
 * Server Action, com folga para os outros campos (o bucket da 0085 aceita 1 MB). */
const TIPOS_DO_LOGO: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };
const TAMANHO_DO_LOGO = 500 * 1024;

function extrairValores(formData: FormData): ValoresDoCliente {
  return {
    nomeFantasia: texto(formData, "nome_fantasia"),
    razaoSocial: texto(formData, "razao_social"),
    cnpj: texto(formData, "cnpj"),
    ramoAtividade: texto(formData, "ramo_atividade"),
    ativo: texto(formData, "status") !== "inativo",
    tituloPdf: texto(formData, "titulo_pdf"),
    nomeFantasiaNoRemetente: texto(formData, "nome_fantasia_no_remetente") === "sim",
    legendaNasImagens: texto(formData, "legenda_nas_imagens") !== "nao",
    minCaracteresDescricao: texto(formData, "min_caracteres_descricao"),
    minCaracteresAcoes: texto(formData, "min_caracteres_acoes"),
  };
}

function inteiro(valor: string): number | null {
  if (valor.trim() === "") return 0;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
}

export async function salvarCliente(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const nome = valores.nomeFantasia.replace(/\s+/g, " ").trim();
  if (!nome) return { erro: "Informe o nome fantasia.", valores };
  if (nome.length > 100) return { erro: "O nome fantasia deve ter no máximo 100 caracteres.", valores };
  if (valores.razaoSocial.length > 200) return { erro: "A razão social deve ter no máximo 200 caracteres.", valores };
  if (valores.ramoAtividade.length > 100) return { erro: "O ramo de atividade deve ter no máximo 100 caracteres.", valores };
  if (valores.tituloPdf.length > 80) return { erro: "O título do PDF deve ter no máximo 80 caracteres.", valores };
  const cnpj = valores.cnpj.replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return { erro: "O CNPJ deve ter 14 dígitos.", valores };
  const minDescricao = inteiro(valores.minCaracteresDescricao);
  const minAcoes = inteiro(valores.minCaracteresAcoes);
  if (minDescricao === null || minAcoes === null) {
    return { erro: "Os mínimos de caracteres devem ser números inteiros entre 0 e 1000.", valores };
  }

  const supabase = await createClient();
  const idRequisicao = gerarIdDeRequisicao();

  // Logotipo novo, quando veio arquivo: sobe antes, grava o caminho junto.
  let logotipoPath: string | undefined;
  const arquivo = formData.get("logotipo");
  if (arquivo instanceof File && arquivo.size > 0) {
    const extensao = TIPOS_DO_LOGO[arquivo.type];
    if (!extensao) return { erro: "O logotipo deve ser PNG ou JPEG.", valores };
    if (arquivo.size > TAMANHO_DO_LOGO) return { erro: "O logotipo deve ter no máximo 500 KB.", valores };
    logotipoPath = `logotipo.${extensao}`;
    const { error } = await supabase.storage
      .from("cliente")
      .upload(logotipoPath, arquivo, { upsert: true, contentType: arquivo.type });
    if (error) {
      registrarErro(idRequisicao, "Cliente: falha ao enviar o logotipo:", error);
      return { erro: "Não foi possível enviar o logotipo. Tente de novo.", valores };
    }
  }

  // UPDATE barrado pelo RLS volta zero linhas, nao erro.
  const resultado = await supabase
    .from("cliente")
    .update({
      nome_fantasia: nome,
      razao_social: valores.razaoSocial.trim() || null,
      cnpj: cnpj || null,
      ramo_atividade: valores.ramoAtividade.trim() || null,
      ativo: valores.ativo,
      titulo_pdf: valores.tituloPdf.trim() || null,
      nome_fantasia_no_remetente: valores.nomeFantasiaNoRemetente,
      legenda_nas_imagens: valores.legendaNasImagens,
      min_caracteres_descricao: minDescricao,
      min_caracteres_acoes: minAcoes,
      ...(logotipoPath ? { logotipo_path: logotipoPath } : {}),
    })
    .eq("unica", true)
    .select("unica")
    .maybeSingle();
  const verificacao = verificarEscritaComRls(resultado, MENSAGENS, MENSAGENS.semPermissao);
  if (!verificacao.ok) return { erro: verificacao.erro, valores };

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
