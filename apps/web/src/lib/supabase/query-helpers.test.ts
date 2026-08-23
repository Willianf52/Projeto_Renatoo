import { describe, expect, it } from "vitest";
import { buscarEmPaginas, LIMITE_EXPORTACAO, paginar, resultadoExportacao } from "./query-helpers";

describe("paginar", () => {
  it("primeira pagina comeca em 0", () => {
    expect(paginar(1, 25)).toEqual({ from: 0, to: 24 });
  });

  it("terceira pagina desloca pelo tamanho da pagina", () => {
    expect(paginar(3, 25)).toEqual({ from: 50, to: 74 });
  });

  it("pagina zero ou negativa cai na primeira pagina", () => {
    expect(paginar(0, 25)).toEqual({ from: 0, to: 24 });
    expect(paginar(-5, 25)).toEqual({ from: 0, to: 24 });
  });
});

describe("resultadoExportacao", () => {
  it("nao trunca quando o resultado cabe no limite", () => {
    const { rows, truncado } = resultadoExportacao([1, 2, 3], 5);

    expect(rows).toEqual([1, 2, 3]);
    expect(truncado).toBe(false);
  });

  it("trunca e sinaliza quando vem um a mais que o limite", () => {
    const { rows, truncado } = resultadoExportacao([1, 2, 3, 4], 3);

    expect(rows).toEqual([1, 2, 3]);
    expect(truncado).toBe(true);
  });

  it("usa LIMITE_EXPORTACAO como padrao quando nenhum limite e passado", () => {
    const linhas = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) => i);

    const { rows, truncado } = resultadoExportacao(linhas);

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});

describe("buscarEmPaginas", () => {
  /** Simula o PostgREST: devolve a fatia pedida, mas nunca mais que `tetoDoServidor`
   * linhas por resposta -- que e exatamente o `max_rows` que causou o bug. */
  function servidorFake(total: number, tetoDoServidor = 1000) {
    const todas = Array.from({ length: total }, (_, i) => i);
    const idas: Array<[number, number]> = [];

    const buscar = (de: number, ate: number) => {
      idas.push([de, ate]);
      const pedidas = ate - de + 1;
      return Promise.resolve({
        data: todas.slice(de, de + Math.min(pedidas, tetoDoServidor)),
        error: null,
      });
    };

    return { buscar, idas };
  }

  it("junta todas as paginas em um resultado so", async () => {
    const { buscar } = servidorFake(2500);

    const { linhas, atingiuTeto } = await buscarEmPaginas<number>(buscar);

    expect(linhas).toHaveLength(2500);
    expect(linhas[0]).toBe(0);
    expect(linhas[2499]).toBe(2499);
    expect(atingiuTeto).toBe(false);
  });

  it("resultado menor que uma pagina nao vira busca extra desnecessaria", async () => {
    const { buscar, idas } = servidorFake(10);

    const { linhas, atingiuTeto } = await buscarEmPaginas<number>(buscar);

    expect(linhas).toHaveLength(10);
    expect(atingiuTeto).toBe(false);
    // Uma ida traz as 10, a segunda volta vazia e encerra.
    expect(idas).toHaveLength(2);
  });

  it("resultado vazio devolve lista vazia, nao erro", async () => {
    const { buscar } = servidorFake(0);

    expect(await buscarEmPaginas<number>(buscar)).toEqual({ linhas: [], atingiuTeto: false });
  });

  /**
   * O caso que a condicao ingenua ("parou quando veio menos que o pedido")
   * erraria: com o servidor cortando em 300 e a busca pedindo 1000, a primeira
   * pagina ja volta "menor que o pedido" -- e a busca pararia em 300 de 2500,
   * reintroduzindo exatamente o bug que ela existe para corrigir.
   */
  it("funciona quando o teto do servidor e menor que a pagina pedida", async () => {
    const { buscar } = servidorFake(2500, 300);

    const { linhas, atingiuTeto } = await buscarEmPaginas<number>(buscar);

    expect(linhas).toHaveLength(2500);
    expect(atingiuTeto).toBe(false);
  });

  it("para no teto e sinaliza, em vez de varrer sem fim", async () => {
    const { buscar } = servidorFake(10_000);

    const { linhas, atingiuTeto } = await buscarEmPaginas<number>(buscar, 2000);

    expect(linhas).toHaveLength(2000);
    expect(atingiuTeto).toBe(true);
  });

  it("nao busca alem do teto nem quando ele cai no meio de uma pagina", async () => {
    const { buscar, idas } = servidorFake(10_000);

    const { linhas } = await buscarEmPaginas<number>(buscar, 1500);

    expect(linhas).toHaveLength(1500);
    expect(idas[idas.length - 1][1]).toBe(1499);
  });

  it("propaga erro do banco em vez de devolver resultado parcial", async () => {
    const buscar = () => Promise.resolve({ data: null, error: { message: "falha" } });

    await expect(buscarEmPaginas<number>(buscar)).rejects.toEqual({ message: "falha" });
  });
});
