"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { texto } from "@/lib/form-data";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeEditarChecklist } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao } from "../importacao";

const LISTAGEM = "/dashboard/checklistlab/perguntas";
/** Abaixo do teto de 1 MB do corpo de uma Server Action. */
const TAMANHO_MAXIMO = 512 * 1024;

export type ResultadoDaImportacao = {
  criadas: number;
  pulados: { linha: number; nome: string; motivo: string }[];
  erros: { linha: number; mensagem: string }[];
};

export type EstadoDaImportacao = { erro?: string; resultado?: ResultadoDaImportacao };

const MENSAGENS_DE_ERRO = {
  // Outra pessoa cadastrou pergunta no mesmo checklist enquanto o arquivo
  // subia: a ordem calculada bateu. O insert e um so -- nada entrou.
  duplicado: "Outra pessoa mexeu neste checklist enquanto o arquivo era enviado. Nada foi importado; envie de novo.",
  semPermissao: "Você não tem permissão para cadastrar perguntas do checklist.",
  fkInvalida: "Um grupo ou evento do arquivo deixou de existir. Nada foi importado; envie de novo.",
  generico: "Não foi possível importar as perguntas. Tente novamente.",
};

export async function importarPerguntas(_estado: EstadoDaImportacao, formData: FormData): Promise<EstadoDaImportacao> {
  if (!(await podeEditarChecklist())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

  const modeloId = Number(texto(formData, "modelo"));
  if (!Number.isSafeInteger(modeloId) || modeloId <= 0) return { erro: "Checklist inválido." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo .csv com as perguntas." };
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };

  const linhas = lerCsv(decodificar(await arquivo.arrayBuffer()));
  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  const [perguntas, grupos, eventos] = await Promise.all([
    supabase.from("perguntas_checklist").select("texto, ordem").eq("modelo_id", modeloId),
    supabase.from("grupos_perguntas").select("id, nome"),
    supabase.from("eventos").select("id, nome").eq("ativo", true),
  ]);
  const falha = perguntas.error ?? grupos.error ?? eventos.error;
  if (falha) {
    registrarErro(idRequisicao, "Importar perguntas: falha ao ler o que ja existe:", falha);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  const plano = planejarImportacao(linhas, {
    textos: (perguntas.data ?? []).map((p) => p.texto),
    maiorOrdem: Math.max(0, ...(perguntas.data ?? []).map((p) => p.ordem)),
    grupos: grupos.data ?? [],
    eventos: eventos.data ?? [],
  });
  if (!plano.ok) return { erro: plano.erro };

  // Tudo ou nada quando ha linha com erro, como os outros Importar.
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhuma pergunta foi importada. Corrija as linhas abaixo e envie o arquivo de novo.",
      resultado: { criadas: 0, pulados: plano.pulados, erros: plano.erros },
    };
  }
  if (plano.novas.length === 0) return { resultado: { criadas: 0, pulados: plano.pulados, erros: [] } };

  // Um insert so: e atomico -- entram todas ou nenhuma.
  const { data, error } = await supabase
    .from("perguntas_checklist")
    .insert(plano.novas.map((p) => ({ ...p, modelo_id: modeloId })))
    .select("id");
  if (error) {
    registrarErro(idRequisicao, "Importar perguntas: insert recusado:", error);
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO) };
  }

  revalidatePath(LISTAGEM);
  return { resultado: { criadas: data?.length ?? 0, pulados: plano.pulados, erros: [] } };
}

/** UTF-8 primeiro; se nao for valido, Windows-1252 (o "CSV" padrao do Excel
 * em pt-BR). Mesmo criterio do Importar Grupos de Sites. */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
