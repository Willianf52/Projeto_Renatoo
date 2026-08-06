"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

/** Limites de aplicacao, nao do banco -- mesmo criterio das demais telas. */
const LIMITE_NOME = 200;
const LIMITE_DESCRICAO = 500;

export type ValoresDoGrupo = {
  nome: string;
  descricao: string;
  membros: string[];
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoGrupo;
};

/** Formato de um uuid do Postgres. Os checkboxes da tela nao sao garantia: o
 * POST pode ser montado a mao, e o valor vai para uma FK `uuid`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extrairValores(formData: FormData): ValoresDoGrupo {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    descricao: String(formData.get("descricao") ?? "").trim(),
    // `getAll`: sao varios checkboxes com o mesmo name, um por pessoa.
    membros: formData
      .getAll("membros")
      .map((valor) => String(valor).trim())
      .filter(Boolean),
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
  if (valores.membros.some((id) => !UUID.test(id))) return "Membro inválido.";

  // Dois checkboxes com o mesmo valor violariam a PK (grupo_id, profile_id) e
  // voltariam como erro de duplicata, que aqui nao significa nada para quem
  // esta usando a tela.
  if (new Set(valores.membros).size !== valores.membros.length) {
    return "Há membros repetidos na seleção.";
  }

  return null;
}

/** `nome` e unique (migration 0003). */
const NOME_DUPLICADO = "23505";
/** Escrita barrada pelo RLS. */
const SEM_PERMISSAO = "42501";

function traduzirErro(codigo: string | undefined): string {
  if (codigo === NOME_DUPLICADO) return "Já existe um grupo de usuários com esse nome.";
  if (codigo === SEM_PERMISSAO) return "Você não tem permissão para administrar grupos de usuários.";
  return "Não foi possível salvar o grupo. Tente novamente.";
}

/**
 * Sincroniza os membros: apaga os vinculos atuais e recria os marcados.
 *
 * Apagar e recriar, em vez de calcular a diferenca, e deliberado. A tabela e
 * so a chave primaria -- nao ha coluna nenhuma para preservar entre um estado
 * e outro -- e o diff exigiria ler os vinculos atuais para comparar, um
 * round-trip a mais para chegar no mesmo lugar.
 *
 * A janela entre o delete e o insert existe e nao e protegida por transacao: o
 * PostgREST nao expoe uma. O efeito de uma leitura concorrente cair no meio e
 * ver o grupo momentaneamente sem membros -- e `grupos_usuarios_membros` hoje
 * so alimenta um filtro da tela de Usuarios, nao decide acesso a nada. Se um
 * dia decidir, isto vira uma funcao `security definer` no banco.
 */
async function sincronizarMembros(
  supabase: Awaited<ReturnType<typeof createClient>>,
  grupoId: number,
  membros: string[],
): Promise<string | undefined> {
  const { error: erroLimpeza } = await supabase
    .from("grupos_usuarios_membros")
    .delete()
    .eq("grupo_id", grupoId);

  if (erroLimpeza) return erroLimpeza.code;

  if (membros.length === 0) return undefined;

  const { error } = await supabase
    .from("grupos_usuarios_membros")
    .insert(membros.map((profileId) => ({ grupo_id: grupoId, profile_id: profileId })));

  return error?.code;
}

export async function salvarGrupoUsuarios(
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
  const linha = { nome: valores.nome, descricao: valores.descricao || null };

  let grupoId: number;

  if (id === null) {
    // `.select()` para recuperar o id gerado: os membros precisam dele, e sem
    // isto seria uma segunda consulta buscando o grupo pelo nome.
    const { data, error } = await supabase
      .from("grupos_usuarios")
      .insert(linha)
      .select("id")
      .maybeSingle();

    if (error) return { erro: traduzirErro(error.code), valores };
    if (!data) {
      // INSERT barrado pelo RLS devolve erro, mas um `select` pos-insert que
      // a policy de leitura recuse voltaria vazio -- e prosseguir daqui
      // gravaria membros num grupo que nao da para confirmar que existe.
      return { erro: traduzirErro(SEM_PERMISSAO), valores };
    }

    grupoId = data.id;
  } else {
    /**
     * O `.select()` nao e enfeite, mesmo motivo das demais telas: um UPDATE
     * barrado pelo RLS nao devolve erro, devolve zero linhas alteradas.
     */
    const { data, error } = await supabase
      .from("grupos_usuarios")
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

    grupoId = id;
  }

  const erroDeMembros = await sincronizarMembros(supabase, grupoId, valores.membros);
  if (erroDeMembros) return { erro: traduzirErro(erroDeMembros), valores };

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
