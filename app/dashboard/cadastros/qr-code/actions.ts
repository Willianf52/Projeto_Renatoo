"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/qr-code";

/** Limites de aplicacao, nao do banco -- mesmo criterio das demais telas de
 * cadastro: recusam colagem acidental de texto enorme, nao regra de negocio. */
const LIMITE_CODIGO = 100;
const LIMITE_FINALIDADE = 200;

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
    codigo: String(formData.get("codigo") ?? "").trim(),
    siteId: String(formData.get("site_id") ?? "").trim(),
    finalidade: String(formData.get("finalidade") ?? "").trim(),
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
  if (!valores.codigo) return { ok: false, erro: "Informe o código do QR." };
  if (valores.codigo.length > LIMITE_CODIGO) {
    return { ok: false, erro: `O código deve ter no máximo ${LIMITE_CODIGO} caracteres.` };
  }

  /**
   * O codigo e lido de uma etiqueta por um leitor e depois casado por nome na
   * importacao. Espaco em branco no meio e caractere invisivel sobrevivem ao
   * `trim` das bordas e produzem um cadastro que parece certo na tela e nunca
   * casa com o lote -- o tipo de defeito que ninguem liga ao cadastro. Lista
   * fechada de caracteres resolve sem inventar formato.
   */
  if (!/^[A-Za-z0-9._-]+$/.test(valores.codigo)) {
    return {
      ok: false,
      erro: "O código aceita apenas letras, números, ponto, hífen e sublinhado — sem espaços.",
    };
  }

  if (valores.finalidade.length > LIMITE_FINALIDADE) {
    return {
      ok: false,
      erro: `A finalidade deve ter no máximo ${LIMITE_FINALIDADE} caracteres.`,
    };
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

/** `codigo` e unique (migration 0003). Sem esta traducao o usuario receberia o
 * texto cru do Postgres, que cita o nome da constraint e nao explica nada. */
const CODIGO_DUPLICADO = "23505";

/** INSERT barrado pelo RLS. Diferente do UPDATE, que passa em silencio, o
 * insert falha alto -- e a mensagem generica faria a pessoa repetir a acao
 * para sempre, porque tentar de novo nao resolve. */
const SEM_PERMISSAO = "42501";

/** FK apontando para site que sumiu entre o carregamento do formulario e o
 * envio. */
const FK_INVALIDA = "23503";

function traduzirErro(codigo: string | undefined): string {
  if (codigo === CODIGO_DUPLICADO) return "Já existe um QR-Code com esse código.";
  if (codigo === SEM_PERMISSAO) return "Você não tem permissão para cadastrar QR-Codes.";
  if (codigo === FK_INVALIDA) return "O site selecionado não existe mais. Recarregue a página.";
  return "Não foi possível salvar o QR-Code. Tente novamente.";
}

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

    if (error) return { erro: traduzirErro(error.code), valores };
  } else {
    /**
     * O `.select()` nao e enfeite, mesmo motivo das demais telas: um UPDATE
     * barrado pelo RLS nao devolve erro, devolve zero linhas alteradas. Sem
     * conferir isso, quem nao tem permissao veria a mensagem de sucesso e
     * voltaria para a listagem com o registro intacto.
     */
    const { data, error } = await supabase
      .from("qr_codes")
      .update(validacao.linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { erro: traduzirErro(error.code), valores };

    if (!data) {
      return {
        erro: "Você não tem permissão para editar este QR-Code, ou ele não existe mais.",
        valores,
      };
    }
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
