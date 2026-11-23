/**
 * "Importar grupos de usuarios", como no sistema de referencia (13/11/2026):
 * a regra, sem banco e sem arquivo. Recebe as linhas ja lidas do CSV, os
 * nomes de grupo que ja existem e os perfis (para achar cada login), e
 * devolve o plano. A action (`importar/actions.ts`) so executa.
 *
 * O FORMATO E O DO ANTIGO: colunas "Nome do grupo", "Descricao" e "Logins
 * dos usuarios", achadas pelo NOME do cabecalho (a ordem pode mudar). Os
 * logins vao na mesma celula, separados por virgula, ponto e virgula ou
 * quebra de linha; cada um e procurado no login e, sem achar, no e-mail.
 *
 * Mesmas decisoes da importacao de Grupo de Sites: grupo que ja existe e
 * pulado, nunca alterado; repetido no arquivo, pulado; linha com erro barra o
 * arquivo inteiro. E, como no cadastro (12/10/2026), grupo sem nenhum membro
 * nao entra.
 */

export const MAXIMO_DE_LINHAS = 1000;

export type GrupoParaImportar = { nome: string; descricao: string | null; membros: string[] };

export type PerfilParaImportar = { id: string; login: string | null; email: string | null };

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: GrupoParaImportar[];
      /** `linha` conta o cabecalho como 1, como a planilha mostra. */
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

function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  return cabecalho.findIndex((coluna) => nomes.includes(chaveDoNome(coluna)));
}

/** "a@x.com; b@x.com" -> ["a@x.com", "b@x.com"]. */
export function separarLogins(celula: string): string[] {
  return celula
    .split(/[,;\n\r|]+/)
    .map((login) => login.trim())
    .filter(Boolean);
}

export function planejarImportacao(
  linhas: string[][],
  nomesExistentes: string[],
  perfis: PerfilParaImportar[],
): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const colunaNome = indiceDaColuna(cabecalho, "nome do grupo", "nome");
  const colunaDescricao = indiceDaColuna(cabecalho, "descricao");
  const colunaLogins = indiceDaColuna(cabecalho, "logins dos usuarios", "logins", "usuarios");

  if (colunaNome === -1 || colunaLogins === -1) {
    return {
      ok: false,
      erro: 'A primeira linha precisa ter as colunas "Nome do grupo" e "Logins dos usuários", como na planilha do sistema antigo.',
    };
  }
  if (dados.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem mais de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const porLogin = new Map<string, string>();
  for (const perfil of perfis) {
    if (perfil.email) porLogin.set(perfil.email.trim().toLowerCase(), perfil.id);
  }
  // O login vence o e-mail quando os dois coincidem em pessoas diferentes.
  for (const perfil of perfis) {
    if (perfil.login) porLogin.set(perfil.login.trim().toLowerCase(), perfil.id);
  }

  const jaVistos = new Set(nomesExistentes.map(chaveDoNome));
  const noArquivo = new Set<string>();
  const novos: GrupoParaImportar[] = [];
  const pulados: { linha: number; nome: string; motivo: string }[] = [];
  const erros: { linha: number; mensagem: string }[] = [];

  dados.forEach((campos, indice) => {
    const linha = indice + 2;
    if (campos.every((campo) => campo.trim() === "")) return;

    const nome = (campos[colunaNome] ?? "").replace(/\s+/g, " ").trim();
    const descricao = colunaDescricao === -1 ? "" : (campos[colunaDescricao] ?? "").trim();

    if (nome === "") {
      erros.push({ linha, mensagem: "Informe o nome do grupo." });
      return;
    }
    if (nome.length > 200) {
      erros.push({ linha, mensagem: "O nome deve ter no máximo 200 caracteres." });
      return;
    }
    if (descricao.length > 500) {
      erros.push({ linha, mensagem: "A descrição deve ter no máximo 500 caracteres." });
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

    const logins = separarLogins(campos[colunaLogins] ?? "");
    if (logins.length === 0) {
      erros.push({ linha, mensagem: `O grupo "${nome}" precisa de ao menos um login de usuário.` });
      return;
    }
    const naoAchados = logins.filter((login) => !porLogin.has(login.toLowerCase()));
    if (naoAchados.length > 0) {
      erros.push({
        linha,
        mensagem: `Usuário não encontrado: ${naoAchados.join(", ")}. Confira o login no cadastro de Usuários.`,
      });
      return;
    }

    noArquivo.add(chave);
    novos.push({
      nome,
      descricao: descricao === "" ? null : descricao,
      membros: [...new Set(logins.map((login) => porLogin.get(login.toLowerCase())!))],
    });
  });

  return { ok: true, novos, pulados, erros };
}
