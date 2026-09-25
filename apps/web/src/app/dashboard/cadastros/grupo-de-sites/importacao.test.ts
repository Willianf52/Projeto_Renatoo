import { describe, expect, it } from "vitest";
import { MAXIMO_DE_LINHAS, planejarImportacao } from "./importacao";

const CABECALHO_DO_EXPORTAR = ["ID", "Nome", "Status", "Descrição"];

describe("planejarImportacao", () => {
  it("aceita de volta o arquivo do Exportar, ignorando o ID", () => {
    const plano = planejarImportacao(
      [CABECALHO_DO_EXPORTAR, ["77", "Grupo Norte", "Ativo", "Filiais do norte"], ["", "Grupo Sul", "Inativo", ""]],
      [],
    );

    expect(plano).toEqual({
      ok: true,
      novos: [
        { nome: "Grupo Norte", descricao: "Filiais do norte", ativo: true },
        { nome: "Grupo Sul", descricao: null, ativo: false },
      ],
      pulados: [],
      erros: [],
    });
  });

  it("acha as colunas pelo nome, em qualquer ordem, com ou sem acento", () => {
    const plano = planejarImportacao([["descricao", "NOME"], ["Texto", "Grupo A"]], []);

    expect(plano.ok && plano.novos).toEqual([{ nome: "Grupo A", descricao: "Texto", ativo: true }]);
  });

  it("pula o grupo que ja existe, sem diferenciar maiuscula, acento ou espaco", () => {
    const plano = planejarImportacao([["Nome"], ["  ARUMA "], ["Novo"]], ["Arumã"]);

    expect(plano).toMatchObject({
      novos: [{ nome: "Novo" }],
      pulados: [{ linha: 2, nome: "ARUMA", motivo: "já existe um grupo com esse nome" }],
    });
  });

  it("pula o repetido dentro do proprio arquivo, mantendo o primeiro", () => {
    const plano = planejarImportacao([["Nome", "Descrição"], ["Leste", "primeiro"], ["leste", "segundo"]], []);

    expect(plano).toMatchObject({
      novos: [{ nome: "Leste", descricao: "primeiro" }],
      pulados: [{ linha: 3, motivo: "repetido no próprio arquivo" }],
    });
  });

  it("aponta a linha da planilha em cada erro, contando o cabecalho e as linhas vazias", () => {
    const plano = planejarImportacao(
      [["Nome", "Status"], ["", "Ativo"], [""], ["Grupo", "Talvez"], ["x".repeat(201), ""]],
      [],
    );

    expect(plano).toMatchObject({
      novos: [],
      erros: [
        { linha: 2, mensagem: "Informe o nome do grupo." },
        { linha: 4, mensagem: 'Status "Talvez" inválido: use Ativo ou Inativo.' },
        { linha: 5, mensagem: "O nome deve ter no máximo 200 caracteres." },
      ],
    });
  });

  it("recusa arquivo sem a coluna Nome", () => {
    expect(planejarImportacao([["Grupo", "Status"], ["A", "Ativo"]], [])).toMatchObject({ ok: false });
  });

  it("recusa arquivo vazio", () => {
    expect(planejarImportacao([], [])).toEqual({ ok: false, erro: "O arquivo está vazio." });
  });

  it("recusa arquivo acima do limite de linhas", () => {
    const linhas = [["Nome"], ...Array.from({ length: MAXIMO_DE_LINHAS + 1 }, (_, i) => [`G${i}`])];

    expect(planejarImportacao(linhas, [])).toMatchObject({ ok: false });
  });
});
