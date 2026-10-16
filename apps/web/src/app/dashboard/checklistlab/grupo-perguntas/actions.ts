"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { esquemaDoGrupo, LISTAGEM } from "./regras";

export type ValoresDoGrupo = { nome: string; cor: string; ordem: string; ativo: boolean };
export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoGrupo };

function extrairValores(formData: FormData): ValoresDoGrupo {
  return {
    nome: texto(formData, "nome"),
    cor: texto(formData, "cor"),
    ordem: texto(formData, "ordem"),
    ativo: texto(formData, "status") !== "inativo",
  };
}

/** Nome unico sem maiusculas (0073); escrita da gestao (`pode_administrar_cadastros`). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um grupo de perguntas com esse nome.",
  semPermissao: "Você não tem permissão para cadastrar grupos de perguntas.",
  generico: "Não foi possível salvar o grupo. Tente novamente.",
};

export async function salvarGrupo(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) return { erro: "Registro inválido.", valores };

  const validado = esquemaDoGrupo.safeParse({
    nome: valores.nome,
    cor: valores.cor,
    ordem: valores.ordem === "" ? Number.NaN : Number(valores.ordem),
  });
  if (!validado.success) return { erro: validado.error.issues[0].message, valores };

  const linha = {
    nome: validado.data.nome,
    cor: validado.data.cor.toLowerCase(),
    ordem: validado.data.ordem,
    ativo: valores.ativo,
  };
  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("grupos_perguntas").insert(linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // UPDATE barrado pelo RLS devolve zero linhas, nao erro.
    const resultado = await supabase.from("grupos_perguntas").update(linha).eq("id", id).select("id").maybeSingle();
    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este grupo, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
