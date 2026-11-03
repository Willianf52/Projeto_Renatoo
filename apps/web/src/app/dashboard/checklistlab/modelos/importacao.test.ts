import { describe, expect, it } from "vitest";
import { planejarImportacao } from "./importacao";

describe("planejarImportacao (Importar Checklists)", () => {
  it("cria os novos, com o status, e pula o que já existe sem diferenciar acento", () => {
    const plano = planejarImportacao(
      [
        ["Checklist", "Status"],
        ["Portaria Norte", "Ativo"],
        ["Limpeza", ""],
        ["Condomínio Teste", "Inativo"],
        ["", ""],
      ],
      ["condomínio teste"],
    );
    expect(plano).toEqual({
      ok: true,
      novos: [
        { nome: "Portaria Norte", ativo: true },
        { nome: "Limpeza", ativo: true },
      ],
      pulados: [{ linha: 4, nome: "Condomínio Teste", motivo: "já existe um checklist com esse nome" }],
      erros: [],
    });
  });

  it("aceita 'Nome do Checklist' como cabeçalho e pula repetido no próprio arquivo", () => {
    const plano = planejarImportacao([["Nome do Checklist"], ["A"], ["a"]], []);
    expect(plano).toMatchObject({ ok: true, novos: [{ nome: "A", ativo: true }], pulados: [{ linha: 3 }] });
  });

  it("aponta status inválido e nome vazio", () => {
    const plano = planejarImportacao(
      [
        ["Checklist", "Status"],
        ["X", "talvez"],
        ["", "Ativo"],
      ],
      [],
    );
    expect(plano).toMatchObject({ ok: true, erros: [{ linha: 2 }, { linha: 3 }] });
  });

  it("sem a coluna Checklist, recusa o arquivo", () => {
    expect(planejarImportacao([["Pergunta"], ["x"]], [])).toMatchObject({ ok: false });
  });
});
