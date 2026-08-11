"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/qr-code";

/** Limites de aplicacao, nao do banco -- mesmo criterio das demais telas de
 * cadastro: recusam colagem acidental de texto enorme, nao regra de negocio. */
const esquemaDeTexto = z.object({
  codigo: z
    .string()
    .min(1, "Informe o código do QR.")
    .max(100, "O código deve ter no máximo 100 caracteres.")
    /**
     * O codigo e lido de uma etiqueta por um leitor e depois casado por nome
     * na importacao. Espaco em branco no meio e caractere invisivel
     * sobrevivem ao `trim` das bordas e produzem um cadastro que parece certo
     * na tela e nunca casa com o lote -- o tipo de defeito que ninguem liga
     * ao cadastro. Lista fechada de caracteres resolve sem inventar formato.
     */
    .regex(/^[A-Za-z0-9._-]+$/, "O código aceita apenas letras, números, ponto, hífen e sublinhado — sem espaços."),
  finalidade: z.string().max(200, "A finalidade deve ter no máximo 200 caracteres."),
});

export type ValoresDoQrCode = {
  codigo: string;
  siteId: string;
  finalidade: string;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoQrCode;
};

function extrairValores(formData: FormData): ValoresDoQrCode {
  return {
    codigo: texto(formData, "codigo"),
    siteId: texto(formData, "site_id"),
    finalidade: texto(formData, "finalidade"),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    ativo: formData.get("ativo") !== null,
  };
}

type LinhaDoQrCode = {
  codigo: string;
  site_id: number;
  finalidade: string | null;
  ativo: boolean;
};

function validar(
  valores: ValoresDoQrCode,
): { ok: true; linha: LinhaDoQrCode } | { ok: false; erro: string } {
  const textoValidado = esquemaDeTexto.safeParse(valores);
  if (!textoValidado.success) {
    return { ok: false, erro: textoValidado.error.issues[0].message };
  }

  const siteId = Number(valores.siteId);
  if (!valores.siteId || !Number.isInteger(siteId)) {
    return { ok: false, erro: "Selecione o site." };
  }

  return {
    ok: true,
    linha: {
      codigo: valores.codigo,
      site_id: siteId,
      finalidade: valores.finalidade || null,
      ativo: valores.ativo,
    },
  };
}

/** `codigo` e unique (migration 0003). */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um QR-Code com esse código.",
  semPermissao: "Você não tem permissão para cadastrar QR-Codes.",
  fkInvalida: "O site selecionado não existe mais. Recarregue a página.",
  generico: "Não foi possível salvar o QR-Code. Tente novamente.",
};

export async function salvarQrCode(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const validacao = validar(valores);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("qr_codes").insert(validacao.linha);

    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // Ver `lib/escrita-rls.ts`: um UPDATE barrado pelo RLS nao devolve erro,
    // devolve zero linhas alteradas.
    const resultado = await supabase
      .from("qr_codes")
      .update(validacao.linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este QR-Code, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
