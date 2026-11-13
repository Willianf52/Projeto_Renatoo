"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarGruposDeUsuarios } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao, type PerfilParaImportar } from "../importacao";

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";

/** Abaixo do teto de 1 MB do corpo de uma Server Action (ver Grupo de Sites). */
const TAMANHO_MAXIMO = 512 * 1024;

export type ResultadoDaImportacao = {
  criados: number;
  pulados: { linha: number; nome: string; motivo: string }[];
  erros: { linha: number; mensagem: string }[];
};

export type EstadoDaImportacao = { erro?: string; resultado?: ResultadoDaImportacao };

const MENSAGENS_DE_ERRO = {
  duplicado:
    "Um dos grupos foi cadastrado por outra pessoa enquanto o arquivo era enviado. Envie o arquivo de novo: os que já entraram serão pulados.",
  semPermissao: "Você não tem permissão para administrar grupos de usuários.",
  generico: "Não foi possível importar os grupos. Tente novamente.",
};

/**
 * "Importar grupos de usuarios" (13/11/2026), como no sistema de referencia.
 * Valida o arquivo inteiro antes de gravar: com qualquer linha errada, nada
 * entra. Depois, grupo a grupo: o cadastro e os membros, pela mesma funcao do
 * formulario (`sincronizar_membros_grupo_usuarios`, 0026).
 */
export async function importarGruposUsuarios(
  _estado: EstadoDaImportacao,
  formData: FormData,
): Promise<EstadoDaImportacao> {
  if (!(await podeAdministrarGruposDeUsuarios())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo .csv com os grupos." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };
  }

  const linhas = lerCsv(decodificar(await arquivo.arrayBuffer()));
  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  let nomesExistentes: string[];
  let perfis: PerfilParaImportar[];
  try {
    const [grupos, pessoas] = await Promise.all([
      buscarEmPaginas<{ nome: string }>((de, ate) =>
        supabase.from("grupos_usuarios").select("nome").order("id").range(de, ate),
      ),
      buscarEmPaginas<PerfilParaImportar>((de, ate) =>
        supabase.from("profiles").select("id, login, email").order("id").range(de, ate),
      ),
    ]);
    nomesExistentes = grupos.linhas.map((g) => g.nome);
    perfis = pessoas.linhas;
  } catch (falha) {
    registrarErro(idRequisicao, "Importar grupos de usuários: falha ao ler grupos ou perfis:", falha);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  const plano = planejarImportacao(linhas, nomesExistentes, perfis);
  if (!plano.ok) return { erro: plano.erro };

  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum grupo foi importado. Corrija as linhas abaixo e envie o arquivo de novo.",
      resultado: { criados: 0, pulados: plano.pulados, erros: plano.erros },
    };
  }

  let criados = 0;
  for (const grupo of plano.novos) {
    const { data, error } = await supabase
      .from("grupos_usuarios")
      .insert({ nome: grupo.nome, descricao: grupo.descricao })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      registrarErro(idRequisicao, "Importar grupos de usuários: insert recusado:", error);
      revalidatePath(LISTAGEM);
      return {
        erro: `${traduzirErroPostgres(error?.code, MENSAGENS_DE_ERRO)} Entraram ${criados} de ${plano.novos.length} grupos.`,
      };
    }

    const membros = await supabase.rpc("sincronizar_membros_grupo_usuarios", {
      p_grupo_id: data.id,
      p_membros: grupo.membros,
    });
    if (membros.error) {
      // Sem membro o grupo nao vale (12/10/2026): desfaz o cadastro dele.
      await supabase.from("grupos_usuarios").delete().eq("id", data.id);
      registrarErro(idRequisicao, "Importar grupos de usuários: membros recusados:", membros.error);
      revalidatePath(LISTAGEM);
      return {
        erro: `${traduzirErroPostgres(membros.error.code, MENSAGENS_DE_ERRO)} Entraram ${criados} de ${plano.novos.length} grupos.`,
      };
    }
    criados += 1;
  }

  revalidatePath(LISTAGEM);
  return { resultado: { criados, pulados: plano.pulados, erros: [] } };
}

/** UTF-8 primeiro; se nao for, o Windows-1252 do "Salvar como CSV" do Excel. */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
