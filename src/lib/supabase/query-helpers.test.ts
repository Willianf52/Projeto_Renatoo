import { describe, expect, it } from "vitest";
import { LIMITE_EXPORTACAO, paginar, resultadoExportacao } from "./query-helpers";

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
