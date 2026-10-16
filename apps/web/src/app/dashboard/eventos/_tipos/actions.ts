"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { CADASTROS, type TipoDeCadastro } from "./config";
import { esquemaDoTipo } from "./esquema";

export type ValoresDoTipo = { nome: string; cor: string; ativo: boolean };
export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoTipo };

function extrairValores(formData: FormData): ValoresDoTipo {
  return {
    nome: texto(formData, "nome"),
    cor: texto(formData, "cor"),
    // Mesmo criterio do Grupo de Sites: so "inativo" desativa.
    ativo: texto(formData, "status") !== "inativo",
  };
}

/** Indice unico em `lower(btrim(nome))` (0064); escrita so do GESTOR (0071). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um tipo com esse nome.",
  semPermissao: "Somente o Gestor cadastra tipos de análise e de classificação.",
  generico: "Não foi possível salvar. Tente novamente.",
};

async function salvar(tipo: TipoDeCadastro, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) return { erro: "Registro inválido.", valores };

  const validado = esquemaDoTipo.safeParse(valores);
  if (!validado.success) return { erro: validado.error.issues[0].message, valores };

  const linha = { nome: valores.nome, cor: valores.cor.toLowerCase(), ativo: valores.ativo };
  const { tabela, rota } = CADASTROS[tipo];
  const supabase = await createClient();
  // Mesmo formato nas duas tabelas -- ver `queries.ts`.
  const alvo = supabase.from(tabela as "tipos_de_analise");

  if (id === null) {
    const { error } = await alvo.insert(linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // UPDATE barrado pelo RLS devolve zero linhas, nao erro.
    const resultado = await alvo.update(linha).eq("id", id).select("id").maybeSingle();
    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este tipo, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(rota);
  redirect(`${rota}?salvo=1`);
}

export async function salvarTipoDeAnalise(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  return salvar("analise", formData);
}

export async function salvarTipoDeClassificacao(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  return salvar("classificacao", formData);
}
