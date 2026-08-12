"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

/** Limites de aplicacao, nao do banco -- mesmo criterio das demais telas. */
const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome do grupo.").max(200, "O nome deve ter no máximo 200 caracteres."),
  descricao: z.string().max(500, "A descrição deve ter no máximo 500 caracteres."),
});

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
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    // `getAll`: sao varios checkboxes com o mesmo name, um por pessoa.
    membros: formData
      .getAll("membros")
      .map((valor) => String(valor).trim())
      .filter(Boolean),
  };
}

function validar(valores: ValoresDoGrupo): string | null {
  const textoValidado = esquemaDeTexto.safeParse(valores);
  if (!textoValidado.success) return textoValidado.error.issues[0].message;

  if (valores.membros.some((id) => !UUID.test(id))) return "Membro inválido.";

  // Dois checkboxes com o mesmo valor violariam a PK (grupo_id, profile_id) e
  // voltariam como erro de duplicata, que aqui nao significa nada para quem
  // esta usando a tela.
  if (new Set(valores.membros).size !== valores.membros.length) {
    return "Há membros repetidos na seleção.";
  }

  return null;
}

/** `nome` e unique (migration 0003). Sem FK que a pessoa possa provocar aqui:
 * `mensagens` fica sem `fkInvalida` de proposito, e o generico cobre o caso. */
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um grupo de usuários com esse nome.",
  semPermissao: "Você não tem permissão para administrar grupos de usuários.",
  generico: "Não foi possível salvar o grupo. Tente novamente.",
};

export type EstadoDaExclusao = { erro?: string };

/**
 * Exclusao de grupo (migration 0020).
 *
 * Os vinculos em `grupos_usuarios_membros` nao precisam ser apagados antes: a
 * FK da 0003 e `on delete cascade`. Fazer a limpeza aqui tambem funcionaria,
 * mas seria um round-trip a mais para repetir o que o banco ja garante -- e
 * garante melhor, porque o cascade e atomico com o delete e isto nao seria.
 *
 * O `.select()` existe pelo mesmo motivo do update em `salvarGrupoUsuarios`:
 * um DELETE barrado pelo RLS nao devolve erro, devolve zero linhas apagadas.
 * Sem ele, uma exclusao recusada pela policy voltaria como sucesso silencioso
 * e a linha continuaria na tela ate o proximo carregamento.
 */
export async function excluirGrupoUsuarios(
  _estado: EstadoDaExclusao,
  formData: FormData,
): Promise<EstadoDaExclusao> {
  const idBruto = formData.get("id");
  const id = Number(idBruto);
  if (!idBruto || !Number.isInteger(id)) return { erro: "Registro inválido." };

  const supabase = await createClient();

  const resultado = await supabase.from("grupos_usuarios").delete().eq("id", id).select("id").maybeSingle();

  // Zero linhas: ou a policy recusou, ou alguem ja apagou. Os dois casos dizem
  // a mesma coisa a quem esta na tela -- o grupo nao saiu por sua mao.
  const verificacao = verificarEscritaComRls(
    resultado,
    {
      duplicado: "Não foi possível excluir o grupo. Tente novamente.",
      semPermissao: MENSAGENS_DE_ERRO.semPermissao,
      generico: "Não foi possível excluir o grupo. Tente novamente.",
    },
    "Você não tem permissão para excluir este grupo, ou ele já não existe.",
  );
  if (!verificacao.ok) return { erro: verificacao.erro };

  revalidatePath(LISTAGEM);
  return {};
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
    // isto seria uma segunda consulta buscando o grupo pelo nome. Tambem cobre
    // o caso raro de INSERT aceito mas cuja policy de leitura recusa o
    // `select` de volta -- prosseguir dali gravaria membros num grupo que nao
    // da para confirmar que existe.
    const resultado = await supabase.from("grupos_usuarios").insert(linha).select("id").maybeSingle();

    const verificacao = verificarEscritaComRls(resultado, MENSAGENS_DE_ERRO, MENSAGENS_DE_ERRO.semPermissao);
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
    grupoId = verificacao.data.id;
  } else {
    // Ver `lib/escrita-rls.ts`: um UPDATE barrado pelo RLS nao devolve erro,
    // devolve zero linhas alteradas.
    const resultado = await supabase.from("grupos_usuarios").update(linha).eq("id", id).select("id").maybeSingle();

    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este grupo, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };

    grupoId = id;
  }

  const erroDeMembros = await sincronizarMembros(supabase, grupoId, valores.membros);
  if (erroDeMembros) return { erro: traduzirErroPostgres(erroDeMembros, MENSAGENS_DE_ERRO), valores };

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
