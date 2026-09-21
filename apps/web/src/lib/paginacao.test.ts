import { describe, expect, it } from "vitest";
import { textoDaPaginacao } from "./paginacao";

describe("textoDaPaginacao", () => {
  it("lista vazia nao anuncia pagina zero de uma", () => {
    expect(textoDaPaginacao({ pagina: 1, totalPaginas: 1, totalItens: 0 })).toBe("Nenhum item");
  });

  it('lista vazia com contagem estimada nao vira "~0"', () => {
    expect(
      textoDaPaginacao({ pagina: 1, totalPaginas: 0, totalItens: 0, aproximado: true }),
    ).toBe("Nenhum item");
  });

  it("concorda no singular", () => {
    expect(textoDaPaginacao({ pagina: 1, totalPaginas: 1, totalItens: 1 })).toBe(
      "Pág: 1 de 1 | Total: 1 item",
    );
  });

  it("marca o total estimado com til", () => {
    expect(
      textoDaPaginacao({ pagina: 2, totalPaginas: 5, totalItens: 43, aproximado: true }),
    ).toBe("Pág: 2 de 5 | Total: ~43 itens");
  });

  it("nunca anuncia zero paginas com item na tela", () => {
    expect(textoDaPaginacao({ pagina: 1, totalPaginas: 0, totalItens: 3 })).toBe(
      "Pág: 1 de 1 | Total: 3 itens",
    );
  });

  it("aceita o substantivo da tela", () => {
    expect(
      textoDaPaginacao({ pagina: 1, totalPaginas: 1, totalItens: 1, singular: "local", plural: "locais" }),
    ).toBe("Pág: 1 de 1 | Total: 1 local");
    expect(
      textoDaPaginacao({ pagina: 1, totalPaginas: 1, totalItens: 0, singular: "local", plural: "locais" }),
    ).toBe("Nenhum local");
  });
});
