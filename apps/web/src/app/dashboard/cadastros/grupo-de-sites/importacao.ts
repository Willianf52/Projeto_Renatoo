import { esquemaDeTexto } from "./esquema";

/**
 * A regra da importacao de grupos em lote, sem banco e sem arquivo: recebe as
 * linhas ja lidas do CSV e os nomes que ja existem, e devolve o plano -- o que
 * vira grupo novo, o que e pulado e o que esta errado. A action
 * (`importar/actions.ts`) so executa o plano.
 *
 * O FORMATO E O DO NOSSO EXPORTAR (`export/excel/route.ts`): ID, Nome,
 * Status, Descricao. A pessoa exporta, edita no Excel e importa de volta.
 * `ID` e ignorado de proposito -- quem da id e o banco, e aceitar o da
 * planilha abriria a porta para sobrescrever grupo alheio por engano. As
 * colunas sao achadas pelo NOME do cabecalho, nao pela posicao: so `Nome` e
 * obrigatoria, e a ordem pode mudar na edicao.
 *
 * GRUPO QUE JA EXISTE E PULADO, NUNCA ATUALIZADO (decisao do dono, 25/09):
 * importar nao altera nada que ja estava cadastrado. A comparacao ignora
 * maiusculas, acentos e espacos sobrando -- "Aruma" e "ARUMÃ " sao o mesmo
 * grupo para quem le a lista, e criar os dois seria a duplicata que a
 * pessoa nao queria. O `unique` do banco e mais estreito (exato); aqui se
 * pula mais, e cada pulo aparece no resultado com o motivo.
 */

/** Uma planilha de grupos real tem dezenas de linhas; mil e folga, nao meta. */
export const MAXIMO_DE_LINHAS = 1000;

export type GrupoParaInserir = { nome: string; descricao: string | null; ativo: boolean };

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: GrupoParaInserir[];
      /** `linha` e o numero da linha na planilha, contando o cabecalho como 1. */
      pulados: { linha: number; nome: string; motivo: string }[];
      erros: { linha: number; mensagem: string }[];
    };

export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function indiceDaColuna(cabecalho: string[], nome: string): number {
  return cabecalho.findIndex((coluna) => chaveDoNome(coluna) === nome);
}

export function planejarImportacao(linhas: string[][], nomesExistentes: string[]): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;

  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const colunaNome = indiceDaColuna(cabecalho, "nome");
  const colunaDescricao = indiceDaColuna(cabecalho, "descricao");
  const colunaStatus = indiceDaColuna(cabecalho, "status");

  if (colunaNome === -1) {
    return {
      ok: false,
      erro: "A primeira linha precisa ter a coluna \"Nome\". Use o arquivo do botão Exportar para Excel como modelo.",
    };
  }

  if (dados.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem mais de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const jaVistos = new Set(nomesExistentes.map(chaveDoNome));
  const noArquivo = new Set<string>();
  const novos: GrupoParaInserir[] = [];
  const pulados: { linha: number; nome: string; motivo: string }[] = [];
  const erros: { linha: number; mensagem: string }[] = [];

  dados.forEach((campos, indice) => {
    const linha = indice + 2;
    if (campos.every((campo) => campo === "")) return;

    const nome = (campos[colunaNome] ?? "").replace(/\s+/g, " ").trim();
    const descricao = colunaDescricao === -1 ? "" : (campos[colunaDescricao] ?? "");
    const status = colunaStatus === -1 ? "" : chaveDoNome(campos[colunaStatus] ?? "");

    const texto = esquemaDeTexto.safeParse({ nome, descricao });
    if (!texto.success) {
      erros.push({ linha, mensagem: texto.error.issues[0].message });
      return;
    }

    // Vazio vale "Ativo", como no formulario de cadastro: e o estado de um
    // grupo novo, e obrigar a coluna so atrapalharia quem monta a planilha do zero.
    if (status !== "" && status !== "ativo" && status !== "inativo") {
      erros.push({ linha, mensagem: `Status "${campos[colunaStatus]}" inválido: use Ativo ou Inativo.` });
      return;
    }

    const chave = chaveDoNome(nome);

    if (jaVistos.has(chave)) {
      pulados.push({ linha, nome, motivo: "já existe um grupo com esse nome" });
      return;
    }

    if (noArquivo.has(chave)) {
      pulados.push({ linha, nome, motivo: "repetido no próprio arquivo" });
      return;
    }

    noArquivo.add(chave);
    novos.push({ nome, descricao: descricao === "" ? null : descricao, ativo: status !== "inativo" });
  });

  return { ok: true, novos, pulados, erros };
}
