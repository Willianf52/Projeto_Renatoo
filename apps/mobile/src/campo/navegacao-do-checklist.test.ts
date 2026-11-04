import { describe, expect, it } from "vitest";
import { gruposDasPerguntas, indiceAnterior, proximoIndice } from "./navegacao-do-checklist";

const perguntas = [
  { id: 1, grupo: "Frota" },
  { id: 2, grupo: "Frota" },
  { id: 3, grupo: null },
  { id: 4, grupo: "Limpeza" },
];

describe("proximoIndice", () => {
  it("anda uma a uma sem o filtro, e depois da ultima vem o resumo", () => {
    expect(proximoIndice(perguntas, { 2: "SIM" }, 0, false)).toBe(1);
    expect(proximoIndice(perguntas, {}, 3, false)).toBe(4);
  });

  it("com 'so em branco', pula as respondidas", () => {
    expect(proximoIndice(perguntas, { 2: "SIM", 3: "NAO" }, 0, true)).toBe(3);
  });

  it("com 'so em branco' e nada em branco a frente, vai ao resumo", () => {
    expect(proximoIndice(perguntas, { 2: "SIM", 3: "NA", 4: "SIM" }, 0, true)).toBe(4);
  });
});

describe("indiceAnterior", () => {
  it("volta uma sem o filtro e nao passa da primeira", () => {
    expect(indiceAnterior(perguntas, {}, 2, false)).toBe(1);
    expect(indiceAnterior(perguntas, {}, 0, false)).toBeNull();
  });

  it("do resumo volta para a ultima", () => {
    expect(indiceAnterior(perguntas, {}, 4, false)).toBe(3);
  });

  it("com 'so em branco', volta para a em branco anterior ou fica", () => {
    expect(indiceAnterior(perguntas, { 2: "SIM", 3: "SIM" }, 3, true)).toBe(0);
    expect(indiceAnterior(perguntas, { 1: "SIM" }, 1, true)).toBeNull();
  });
});

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
