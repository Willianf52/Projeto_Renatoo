"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarCadastros } from "@/lib/permissoes";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { planejarImportacao } from "../importacao";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

/**
 * Abaixo do teto de 1 MB que o Next impoe ao corpo de uma Server Action: um
 * arquivo maior nem chegaria aqui, e a pessoa veria um erro generico do
 * framework em vez desta mensagem. Mil grupos com descricao cheia cabem com
 * folga.
 */
const TAMANHO_MAXIMO = 512 * 1024;

export type ResultadoDaImportacao = {
  criados: number;
  pulados: { linha: number; nome: string; motivo: string }[];
  erros: { linha: number; mensagem: string }[];
};

export type EstadoDaImportacao = { erro?: string; resultado?: ResultadoDaImportacao };

const MENSAGENS_DE_ERRO = {
  // So acontece se alguem cadastrar um grupo de mesmo nome entre a leitura dos
  // existentes e o insert. O insert e um so, entao nada entrou.
  duplicado:
    "Um dos grupos foi cadastrado por outra pessoa enquanto o arquivo era enviado. Nada foi importado; envie o arquivo de novo.",
  semPermissao: "Você não tem permissão para cadastrar grupos de sites.",
  generico: "Não foi possível importar os grupos. Tente novamente.",
};

export async function importarGruposSites(
  _estado: EstadoDaImportacao,
  formData: FormData,
): Promise<EstadoDaImportacao> {
  // A tela ja nao aparece para quem nao administra, mas a action e um
  // endpoint proprio e pode ser chamada sem passar pela tela. O RLS tambem
  // recusaria o insert -- esta checagem so troca o erro cru por uma frase.
  if (!(await podeAdministrarCadastros())) return { erro: MENSAGENS_DE_ERRO.semPermissao };

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
  try {
    // Todos os nomes, e nao so os do arquivo: a comparacao ignora acento e
    // maiuscula (`chaveDoNome`), coisa que um `.in("nome", ...)` no banco nao
    // faria. A tabela tem dezenas de linhas.
    const { linhas: existentes } = await buscarEmPaginas<{ nome: string }>((de, ate) =>
      supabase.from("grupos_sites").select("nome").order("id").range(de, ate),
    );
    nomesExistentes = existentes.map((g) => g.nome);
  } catch (falha) {
    registrarErro(idRequisicao, "Importar grupos: falha ao ler os grupos existentes:", falha);
    return { erro: MENSAGENS_DE_ERRO.generico };
  }

  const plano = planejarImportacao(linhas, nomesExistentes);
  if (!plano.ok) return { erro: plano.erro };

  /**
   * TUDO OU NADA quando ha linha com erro. Importar as validas e recusar as
   * outras deixaria a pessoa com metade da planilha dentro e a duvida de
   * quais entraram; corrigindo e reenviando o arquivo inteiro, o que ja
   * entrou seria pulado de qualquer jeito -- mas e mais simples nao ter o que
   * explicar.
   */
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum grupo foi importado. Corrija as linhas abaixo e envie o arquivo de novo.",
      resultado: { criados: 0, pulados: plano.pulados, erros: plano.erros },
    };
  }

  if (plano.novos.length === 0) {
    return { resultado: { criados: 0, pulados: plano.pulados, erros: [] } };
  }

  // Um insert so, com todas as linhas: e uma instrucao, entao e atomico --
  // ou entram todos os grupos novos, ou nenhum. Sem `grupo_pai_id` e sem
  // sites vinculados: o arquivo nao tem essas colunas, e as duas coisas se
  // ajustam depois na edicao do grupo.
  const { data, error } = await supabase.from("grupos_sites").insert(plano.novos).select("id");

  if (error) {
    registrarErro(idRequisicao, "Importar grupos: insert recusado:", error);
    return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO) };
  }

  revalidatePath(LISTAGEM);

  return { resultado: { criados: data?.length ?? 0, pulados: plano.pulados, erros: [] } };
}

/**
 * UTF-8 primeiro (o nosso Exportar e o "CSV UTF-8" do Excel). Se nao for
 * UTF-8 valido, cai para Windows-1252: e o que o Excel em pt-BR grava na
 * opcao "CSV (separado por virgulas)", a padrao do Salvar como -- sem este
 * ramo, todo "Descrição" chegaria como "Descri��o".
 */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
