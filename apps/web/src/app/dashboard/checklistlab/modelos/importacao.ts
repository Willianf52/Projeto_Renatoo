import { chaveDoNome } from "@/app/dashboard/cadastros/grupo-de-sites/importacao";

/**
 * "Importar Checklists" (o botao de mesmo nome do sistema de referencia), sem
 * banco e sem arquivo: recebe as linhas do CSV e os nomes que ja existem, e
 * devolve os checklists a criar.
 *
 * Colunas achadas pelo NOME do cabecalho:
 *   - `Checklist` (ou `Checklists`, `Nome`, `Nome do Checklist`): obrigatoria.
 *   - `Status`: Ativo/Ativa ou Inativo/Inativa; vazio vale ativo.
 * O resto (Descricao, Ordenacao, Modulo do antigo) e ignorado: o modelo daqui
 * e so um nome com a sua lista de perguntas, que entram pelo Importar de cada
 * checklist.
 *
 * Nome que ja existe (sem acento nem maiuscula) e PULADO, nunca alterado --
 * mesma regra dos outros Importar. Linha repetida no proprio arquivo tambem.
 */

export const MAXIMO_DE_LINHAS = 500;

export type ModeloParaInserir = { nome: string; ativo: boolean };

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: ModeloParaInserir[];
      pulados: { linha: number; nome: string; motivo: string }[];
      erros: { linha: number; mensagem: string }[];
    };

function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  return cabecalho.findIndex((coluna) => nomes.includes(chaveDoNome(coluna)));
}

function lerStatus(valor: string): boolean | null {
  const chave = chaveDoNome(valor);
  if (chave === "" || chave === "ativo" || chave === "ativa") return true;
  if (chave === "inativo" || chave === "inativa") return false;
  return null;
}

export function planejarImportacao(linhas: string[][], existentes: string[]): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const colunaNome = indiceDaColuna(cabecalho, "checklist", "checklists", "nome", "nome do checklist");
  const colunaStatus = indiceDaColuna(cabecalho, "status");
  if (colunaNome === -1) {
    return { ok: false, erro: 'O arquivo precisa da coluna "Checklist" (o nome de cada checklist).' };
  }

  const preenchidas = dados.filter((linha) => linha.some((campo) => campo.trim() !== ""));
  if (preenchidas.length === 0) return { ok: false, erro: "O arquivo não tem nenhum checklist." };
  if (preenchidas.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo passa de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const vistos = new Set(existentes.map(chaveDoNome));
  const novos: ModeloParaInserir[] = [];
  const pulados: { linha: number; nome: string; motivo: string }[] = [];
  const erros: { linha: number; mensagem: string }[] = [];

  dados.forEach((linha, indice) => {
    if (!linha.some((campo) => campo.trim() !== "")) return;
    const numero = indice + 2; // o cabecalho e a linha 1
    const nome = (linha[colunaNome] ?? "").replace(/\s+/g, " ").trim();
    if (nome === "") {
      erros.push({ linha: numero, mensagem: "Sem o nome do checklist." });
      return;
    }
    if (nome.length > 200) {
      erros.push({ linha: numero, mensagem: "O nome passa de 200 caracteres." });
      return;
    }
    const ativo = colunaStatus === -1 ? true : lerStatus(linha[colunaStatus] ?? "");
    if (ativo === null) {
      erros.push({ linha: numero, mensagem: 'Status deve ser "Ativo" ou "Inativo".' });
      return;
    }
    const chave = chaveDoNome(nome);
    if (vistos.has(chave)) {
      pulados.push({ linha: numero, nome, motivo: "já existe um checklist com esse nome" });
      return;
    }
    vistos.add(chave);
    novos.push({ nome, ativo });
  });

  return { ok: true, novos, pulados, erros };
}
