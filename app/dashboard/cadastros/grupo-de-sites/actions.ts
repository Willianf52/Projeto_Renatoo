"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

/** Limites de aplicacao, nao do banco: `nome` e `descricao` sao `text` sem
 * restricao de tamanho. Servem para recusar colagem acidental de um texto
 * enorme, nao para validar regra de negocio. */
const LIMITE_NOME = 200;
const LIMITE_DESCRICAO = 500;

export type ValoresDoGrupo = {
  nome: string;
  descricao: string;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoGrupo;
};

function extrairValores(formData: FormData): ValoresDoGrupo {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    descricao: String(formData.get("descricao") ?? "").trim(),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    ativo: formData.get("ativo") !== null,
  };
}

function validar(valores: ValoresDoGrupo): string | null {
  if (!valores.nome) return "Informe o nome do grupo.";
  if (valores.nome.length > LIMITE_NOME) {
    return `O nome deve ter no máximo ${LIMITE_NOME} caracteres.`;
  }
  if (valores.descricao.length > LIMITE_DESCRICAO) {
    return `A descrição deve ter no máximo ${LIMITE_DESCRICAO} caracteres.`;
  }
  return null;
}

/**
 * `nome` e unique (migration 0003). Sem esta traducao o usuario receberia o
 * texto cru do Postgres, que cita o nome da constraint e nao explica nada.
 */
const CODIGO_NOME_DUPLICADO = "23505";

/**
 * INSERT barrado pelo RLS. Diferente do UPDATE, que passa em silencio, o
 * insert falha alto -- e a mensagem generica ("tente novamente") faria a
 * pessoa repetir a acao para sempre, porque tentar de novo nao resolve.
 */
const CODIGO_SEM_PERMISSAO = "42501";

const SEM_PERMISSAO = "Você não tem permissão para cadastrar grupos de sites.";

function traduzirErro(codigo: string | undefined): string {
  if (codigo === CODIGO_NOME_DUPLICADO) return "Já existe um grupo de sites com esse nome.";
  if (codigo === CODIGO_SEM_PERMISSAO) return SEM_PERMISSAO;
  return "Não foi possível salvar o grupo. Tente novamente.";
}

export async function salvarGrupoSite(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);

  const erroDeValidacao = validar(valores);
  if (erroDeValidacao) return { erro: erroDeValidacao, valores };

  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) {
    return { erro: "Registro inválido.", valores };
  }

  const supabase = await createClient();
  const linha = {
    nome: valores.nome,
    descricao: valores.descricao || null,
    ativo: valores.ativo,
  };

  if (id === null) {
    const { error } = await supabase.from("grupos_sites").insert(linha);

    if (error) return { erro: traduzirErro(error.code), valores };
  } else {
    /**
     * O `.select()` nao e enfeite: um UPDATE barrado pelo RLS nao devolve
     * erro, devolve zero linhas alteradas. Sem conferir isso, quem nao tem
     * permissao veria a mensagem de sucesso e voltaria para a listagem com o
     * registro intacto, sem nunca saber que nada foi salvo.
     */
    const { data, error } = await supabase
      .from("grupos_sites")
      .update(linha)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { erro: traduzirErro(error.code), valores };

    if (!data) {
      return {
        erro: "Você não tem permissão para editar este grupo, ou ele não existe mais.",
        valores,
      };
    }
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
