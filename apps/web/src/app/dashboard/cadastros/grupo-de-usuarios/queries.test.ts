import { describe, expect, it } from "vitest";

import { toTableRow, COLUNAS_EXPORTACAO, COLUNAS_DA_LISTAGEM } from "./queries";

type Membro = { profiles: { nome_completo: string | null } | null };

function grupo(membros: Membro[]) {
  return {
    id: 7,
    nome: "Supervisão SICREDI",
    descricao: "Equipe do contrato",
    grupos_usuarios_membros: membros,
  };
}

/** Indice da coluna "Usuários" dentro de `toTableRow`, por rotulo -- cravar o
 * numero faria o teste passar em silencio se uma coluna entrasse antes dela. */
const USUARIOS = COLUNAS_EXPORTACAO.indexOf("Usuários");

describe("toTableRow", () => {
  it("lista os nomes dos membros, e nao a quantidade", () => {
    const linha = toTableRow(
      grupo([
        { profiles: { nome_completo: "Gilmar" } },
        { profiles: { nome_completo: "Gesiel" } },
      ]),
    );

    expect(linha[USUARIOS]).toBe("Gesiel, Gilmar");
  });

  it("ordena por nome, para a lista nao dançar entre dois carregamentos", () => {
    const daOrdemA = toTableRow(
      grupo([
        { profiles: { nome_completo: "Renata Bezerra da Silva" } },
        { profiles: { nome_completo: "Gesiel" } },
        { profiles: { nome_completo: "Odair Viana Lima" } },
      ]),
    );
    const daOrdemB = toTableRow(
      grupo([
        { profiles: { nome_completo: "Odair Viana Lima" } },
        { profiles: { nome_completo: "Renata Bezerra da Silva" } },
        { profiles: { nome_completo: "Gesiel" } },
      ]),
    );

    expect(daOrdemA[USUARIOS]).toBe("Gesiel, Odair Viana Lima, Renata Bezerra da Silva");
    expect(daOrdemA[USUARIOS]).toBe(daOrdemB[USUARIOS]);
  });

  it("ordena acentuado junto do equivalente sem acento, e nao depois do Z", () => {
    const linha = toTableRow(
      grupo([
        { profiles: { nome_completo: "Zilda" } },
        { profiles: { nome_completo: "Ângela" } },
        { profiles: { nome_completo: "Bruno" } },
      ]),
    );

    expect(linha[USUARIOS]).toBe("Ângela, Bruno, Zilda");
  });

  it("omite o membro cujo perfil o RLS escondeu, em vez de deixar um vazio na lista", () => {
    const linha = toTableRow(
      grupo([
        { profiles: { nome_completo: "Gesiel" } },
        { profiles: null },
        { profiles: { nome_completo: null } },
        { profiles: { nome_completo: "   " } },
        { profiles: { nome_completo: "Gilmar" } },
      ]),
    );

    expect(linha[USUARIOS]).toBe("Gesiel, Gilmar");
  });

  it("grupo sem membro nenhum vira celula vazia, nao o texto '0'", () => {
    expect(toTableRow(grupo([])) [USUARIOS]).toBe("");
  });

  it("a listagem esconde o ID que a exportacao mantem", () => {
    expect(COLUNAS_EXPORTACAO).toContain("ID");
    expect(COLUNAS_DA_LISTAGEM).not.toContain("ID");
    // O resto das colunas continua na mesma ordem relativa.
    expect(COLUNAS_DA_LISTAGEM).toEqual(COLUNAS_EXPORTACAO.filter((coluna) => coluna !== "ID"));
  });
});
