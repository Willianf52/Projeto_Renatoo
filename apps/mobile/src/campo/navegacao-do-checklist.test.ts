import { describe, expect, it } from "vitest";
import { gruposDasPerguntas } from "./navegacao-do-checklist";

const perguntas = [
  { id: 1, grupo: "Frota" },
  { id: 2, grupo: "Frota" },
  { id: 3, grupo: null },
  { id: 4, grupo: "Limpeza" },
];

describe("gruposDasPerguntas", () => {
  it("lista os grupos na ordem, com a primeira pergunta e a quantidade", () => {
    expect(gruposDasPerguntas(perguntas)).toEqual([
      { nome: "Frota", primeiro: 0, quantidade: 2 },
      { nome: "Limpeza", primeiro: 3, quantidade: 1 },
    ]);
  });

  it("sem grupo nenhum, lista vazia (a tela nao mostra o seletor)", () => {
    expect(gruposDasPerguntas([{ id: 1 }, { id: 2, grupo: " " }])).toEqual([]);
  });
});
