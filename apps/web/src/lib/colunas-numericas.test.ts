import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { colunasNumericas } from "./colunas-numericas";

describe("colunasNumericas", () => {
  it("marca a coluna em que toda celula e numero", () => {
    const linhas = [
      ["Loja Ipiranga", "12", 3],
      ["Loja Centro", "1.234", 10],
    ];

    expect([...colunasNumericas(linhas)]).toEqual([1, 2]);
  });

  it("aceita decimal com virgula, percentual, sinal e o ~ de estimativa", () => {
    const linhas = [["12,5"], ["-3"], ["87%"], ["~1.200"], ["0,75%"]];

    expect(colunasNumericas(linhas).has(0)).toBe(true);
  });

  it("data e hora nao contam como numero", () => {
    const linhas = [
      ["29/09/2026", "10:30"],
      ["30/09/2026", "11:45"],
    ];

    expect(colunasNumericas(linhas).size).toBe(0);
  });

  it("uma celula de texto tira a coluna inteira", () => {
    const linhas = [["12"], ["doze"], ["14"]];

    expect(colunasNumericas(linhas).has(0)).toBe(false);
  });

  it("celula vazia nao decide, mas coluna toda vazia nao e numerica", () => {
    const linhas = [
      ["", "5"],
      [null, ""],
      [undefined, "7"],
    ];

    expect([...colunasNumericas(linhas)]).toEqual([1]);
  });

  it("elemento React (botao de acao, selo) tira a coluna", () => {
    const linhas = [[createElement("button", null, "Editar")], ["3"]];

    expect(colunasNumericas(linhas).has(0)).toBe(false);
  });

  it("sem linhas, nenhuma coluna", () => {
    expect(colunasNumericas([]).size).toBe(0);
  });

  it("ponto de milhar mal formado nao passa por numero", () => {
    expect(colunasNumericas([["1.23"]]).has(0)).toBe(false);
    expect(colunasNumericas([["12.3456"]]).has(0)).toBe(false);
  });
});
