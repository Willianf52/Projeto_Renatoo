"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Cadastro dos modelos de checklist (migration 0061).
 *
 * Mesmo desenho de `grupo-de-usuarios/actions.ts`: grava o modelo com o token
 * da propria pessoa (a policy `pode_administrar_cadastros()` e o portao) e
 * troca os grupos por RPC atomica (`sincronizar_grupos_do_modelo`) -- dois
 * `.from()` separados deixariam, numa falha entre eles, o modelo sem grupo
 * nenhum, e os grupos dele cairiam calados no modelo padrao.
 *
 * Sem exclusao: modelo respondido e historico (`checklists_visita.modelo_id`
 * e `on delete restrict`, e nao ha grant de DELETE). Despublicar e o Status.
 *
 * O modelo PADRAO nao tem grupos: ele vale para os grupos que nao tem modelo.
 * A tela nem mostra o campo, e a action ignora o que vier -- nao por
 * seguranca (ligar grupo ao padrao nao da acesso a nada), mas para a
 * listagem nao mostrar um padrao "ligado" a grupos, que seria contraditorio.
 */

const LISTAGEM = "/dashboard/checklistlab/modelos";

const esquemaDoModelo = z.object({
  nome: z
    .string()
    .min(1, "Informe o nome do modelo.")
    .max(200, "O nome deve ter no máximo 200 caracteres."),
});

export type ValoresDoModelo = {
  nome: string;
  ativo: boolean;
  grupos: string[];
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoModelo;
};

function extrairValores(formData: FormData): ValoresDoModelo {
  return {
    nome: texto(formData, "nome"),
    // Qualquer coisa diferente de "inativo" cai no lado seguro para um
    // cadastro novo -- mesmo select de duas opcoes de `perguntas`.
    ativo: String(formData.get("status") ?? "") !== "inativo",
    // `getAll`: um checkbox escondido por grupo marcado (`SelecaoMultipla`).
    grupos: formData
      .getAll("grupos")
      .map((valor) => String(valor).trim())
      .filter(Boolean),
  };
}

function validar(valores: ValoresDoModelo): { ok: true; grupos: number[] } | { ok: false; erro: string } {
  const validado = esquemaDoModelo.safeParse(valores);
  if (!validado.success) return { ok: false, erro: validado.error.issues[0].message };

  // O POST pode ser montado a mao: o valor vai para uma FK `bigint`.
  const grupos = valores.grupos.map(Number);
  if (grupos.some((id) => !Number.isInteger(id) || id <= 0)) return { ok: false, erro: "Grupo inválido." };

  return { ok: true, grupos };
}

/** `nome` e unico sem distinguir maiusculas (indice `modelos_checklist_nome_unico`, 0061). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um modelo com esse nome.",
  semPermissao: "Você não tem permissão para cadastrar modelos de checklist.",
  fkInvalida: "Um dos grupos escolhidos não existe mais. Recarregue a página.",
  generico: "Não foi possível salvar o modelo. Tente novamente.",
};

export async function salvarModelo(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const validacao = validar(valores);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const supabase = await createClient();
  const linha = { nome: valores.nome, ativo: valores.ativo };

  let modeloId: number;
  let padrao = false;

  if (id === null) {
    // `.select()` para o id gerado, que os grupos precisam -- e para nao
    // seguir gravando grupos num modelo que a leitura nao confirma.
    const resultado = await supabase
      .from("modelos_checklist")
      .insert(linha)
      .select("id, padrao")
      .maybeSingle();

    const verificacao = verificarEscritaComRls(resultado, MENSAGENS_DE_ERRO, MENSAGENS_DE_ERRO.semPermissao);
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
    modeloId = verificacao.data.id;
  } else {
    // Ver `lib/escrita-rls.ts`: um UPDATE barrado pelo RLS nao devolve erro,
    // devolve zero linhas alteradas.
    const resultado = await supabase
      .from("modelos_checklist")
      .update(linha)
      .eq("id", id)
      .select("id, padrao")
      .maybeSingle();

    // 23514 aqui e o check `modelos_checklist_padrao_ativo`: a tela nao
    // oferece desligar o padrao, entao so chega por POST montado a mao.
    if (resultado.error?.code === "23514") {
      return { erro: "O modelo padrão não pode ser desativado.", valores };
    }

    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este modelo, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };

    modeloId = id;
    padrao = verificacao.data.padrao;
  }

  if (!padrao) {
    const { error } = await supabase.rpc("sincronizar_grupos_do_modelo", {
      p_modelo_id: modeloId,
      p_grupos: validacao.grupos,
    });
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  }

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
