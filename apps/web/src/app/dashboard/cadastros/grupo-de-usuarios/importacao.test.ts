import { describe, expect, it } from "vitest";
import { planejarImportacao, separarLogins } from "./importacao";

const CABECALHO = ["Nome do grupo", "Descrição", "Logins dos usuários"];

const perfis = [
  { id: "u1", login: "ana", email: "ana@up.test" },
  { id: "u2", login: null, email: "bruno@up.test" },
  { id: "u3", login: "Carla.Souza", email: "carla@up.test" },
];

describe("separarLogins", () => {
  it("aceita virgula, ponto e virgula e quebra de linha", () => {
    expect(separarLogins("ana, bruno@up.test;Carla.Souza\nana")).toEqual(["ana", "bruno@up.test", "Carla.Souza", "ana"]);
    expect(separarLogins("  ")).toEqual([]);
  });
});

describe("planejarImportacao (grupos de usuarios)", () => {
  it("cria o grupo achando cada login, e o e-mail quando nao ha login", () => {
    const plano = planejarImportacao(
      [CABECALHO, ["Lote 3", "Supervisão", "ANA; bruno@up.test, carla.souza; ana"]],
      [],
      perfis,
    );
    expect(plano).toEqual({
      ok: true,
      novos: [{ nome: "Lote 3", descricao: "Supervisão", membros: ["u1", "u2", "u3"] }],
      pulados: [],
      erros: [],
    });
  });

  it("pula o grupo que ja existe e o repetido no arquivo, sem alterar", () => {
    const plano = planejarImportacao(
      [CABECALHO, ["Lote 1", "", "ana"], ["Novo", "", "ana"], ["NOVO ", "", "ana"]],
      ["lote 1"],
      perfis,
    );
    expect(plano.ok && plano.novos.map((g) => g.nome)).toEqual(["Novo"]);
    expect(plano.ok && plano.pulados.map((p) => p.motivo)).toEqual([
      "já existe um grupo com esse nome",
      "repetido no próprio arquivo",
    ]);
  });

  it("login desconhecido e grupo sem membro viram erro da linha", () => {
    const plano = planejarImportacao(
      [CABECALHO, ["A", "", "ana, fantasma"], ["B", "", ""]],
      [],
      perfis,
    );
    expect(plano.ok && plano.erros).toEqual([
      { linha: 2, mensagem: "Usuário não encontrado: fantasma. Confira o login no cadastro de Usuários." },
      { linha: 3, mensagem: 'O grupo "B" precisa de ao menos um login de usuário.' },
    ]);
  });

  it("sem as colunas do antigo, recusa o arquivo", () => {
    expect(planejarImportacao([["Nome", "Status"]], [], perfis)).toMatchObject({ ok: false });
    expect(planejarImportacao([], [], perfis)).toEqual({ ok: false, erro: "O arquivo está vazio." });
  });
});
