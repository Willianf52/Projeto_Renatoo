"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeConfigurarEventos } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao } from "../importacao";
import { LISTAGEM } from "../regras";

/** Abaixo do teto de 1 MB do corpo de uma Server Action -- ver o Importar
 * Grupos de Sites. */
const TAMANHO_MAXIMO = 512 * 1024;

export type ResultadoDaImportacao = {
  criados: number;
  pulados: { linha: number; nome: string; motivo: string }[];
  erros: { linha: number; mensagem: string }[];
};

export type EstadoDaImportacao = { erro?: string; aviso?: string; resultado?: ResultadoDaImportacao };

const MENSAGENS_DE_ERRO = {
  duplicado:
    "Um dos eventos foi cadastrado por outra pessoa enquanto o arquivo era enviado. Nada foi importado; envie o arquivo de novo.",
  semPermissao: "Somente o Gestor importa eventos.",
  generico: "Não foi possível importar os eventos. Tente novamente.",
};

export async function importarEventos(_estado: EstadoDaImportacao, formData: FormData): Promise<EstadoDaImportacao> {
  if (!(await podeConfigurarEventos())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo .csv com os eventos." };
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 512 KB. Divida em arquivos menores." };

  const linhas = lerCsv(decodificar(await arquivo.arrayBuffer()));
  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  const { data: existentes, error: erroDeLeitura } = await supabase.from("eventos").select("id, nome, superior_id");
  if (erroDeLeitura) {
    registrarErro(idRequisicao, "Importar eventos: falha ao ler os eventos existentes:", erroDeLeitura);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  const plano = planejarImportacao(
    linhas,
    (existentes ?? []).map((e) => ({ id: e.id, nome: e.nome, superiorId: e.superior_id })),
  );
  if (!plano.ok) return { erro: plano.erro };

  // Tudo ou nada quando ha linha com erro, como no Importar Grupos de Sites.
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum evento foi importado. Corrija as linhas abaixo e envie o arquivo de novo.",
      resultado: { criados: 0, pulados: plano.pulados, erros: plano.erros },
    };
  }
  if (plano.novos.length === 0) return { resultado: { criados: 0, pulados: plano.pulados, erros: [] } };

  // Um insert so para os eventos: e atomico -- entram todos ou nenhum.
  const { data: criados, error } = await supabase
    .from("eventos")
    .insert(plano.novos.map(({ emails: _emails, ...evento }) => evento))
    .select("id, nome");
  if (error) {
    registrarErro(idRequisicao, "Importar eventos: insert recusado:", error);
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO) };
  }

  revalidatePath(LISTAGEM);
  const resultado = { criados: criados?.length ?? 0, pulados: plano.pulados, erros: [] };

  // Os e-mails sao um segundo insert. Se ele falhar, os eventos ja entraram:
  // diz isso, em vez de "nada foi importado", que seria mentira.
  const idPorNome = new Map((criados ?? []).map((c) => [c.nome, c.id]));
  const notificacoes = plano.novos
    .filter((n) => n.emails.length > 0 && idPorNome.has(n.nome))
    .map((n) => ({ evento_id: idPorNome.get(n.nome)!, emails: n.emails }));
  if (notificacoes.length > 0) {
    const { error: erroDosEmails } = await supabase.from("eventos_notificacoes").insert(notificacoes);
    if (erroDosEmails) {
      registrarErro(idRequisicao, "Importar eventos: e-mails recusados:", erroDosEmails);
      return {
        aviso: "Os eventos foram importados, mas os e-mails não. Preencha os e-mails na edição de cada evento.",
        resultado,
      };
    }
  }

  return { resultado };
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
