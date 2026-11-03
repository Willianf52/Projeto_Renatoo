"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeEditarChecklist } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao } from "../importacao";

const LISTAGEM = "/dashboard/checklistlab/modelos";
/** Abaixo do teto de 1 MB do corpo de uma Server Action. */
const TAMANHO_MAXIMO = 512 * 1024;

export type ResultadoDaImportacao = {
  criados: number;
  pulados: { linha: number; nome: string; motivo: string }[];
  erros: { linha: number; mensagem: string }[];
};

export type EstadoDaImportacao = { erro?: string; resultado?: ResultadoDaImportacao };

const MENSAGENS_DE_ERRO = {
  duplicado:
    "Outra pessoa cadastrou um destes checklists enquanto o arquivo era enviado. Nada foi importado; envie de novo.",
  semPermissao: "Você não tem permissão para cadastrar checklists.",
  generico: "Não foi possível importar os checklists. Tente novamente.",
};

/** Mesmo molde do Importar Perguntas (`perguntas/importar/actions.ts`). */
export async function importarModelos(_estado: EstadoDaImportacao, formData: FormData): Promise<EstadoDaImportacao> {
  if (!(await podeEditarChecklist())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo .csv com os checklists." };
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };

  const linhas = lerCsv(decodificar(await arquivo.arrayBuffer()));
  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  const { data: existentes, error: falha } = await supabase.from("modelos_checklist").select("nome");
  if (falha) {
    registrarErro(idRequisicao, "Importar checklists: falha ao ler o que ja existe:", falha);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  const plano = planejarImportacao(
    linhas,
    (existentes ?? []).map((m) => m.nome),
  );
  if (!plano.ok) return { erro: plano.erro };

  // Tudo ou nada quando ha linha com erro, como os outros Importar.
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum checklist foi importado. Corrija as linhas abaixo e envie o arquivo de novo.",
      resultado: { criados: 0, pulados: plano.pulados, erros: plano.erros },
    };
  }
  if (plano.novos.length === 0) return { resultado: { criados: 0, pulados: plano.pulados, erros: [] } };

  // Um insert so: e atomico -- entram todos ou nenhum.
  const { data, error } = await supabase.from("modelos_checklist").insert(plano.novos).select("id");
  if (error) {
    registrarErro(idRequisicao, "Importar checklists: insert recusado:", error);
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO) };
  }

  revalidatePath(LISTAGEM);
  return { resultado: { criados: data?.length ?? 0, pulados: plano.pulados, erros: [] } };
}

/** UTF-8 primeiro; se nao for valido, Windows-1252 (o "CSV" padrao do Excel
 * em pt-BR). Mesmo criterio do Importar Perguntas. */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
