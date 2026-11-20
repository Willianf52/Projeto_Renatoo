import { describe, expect, it } from "vitest";
import { kmNaTela, lerKm, metasPendentes, placaComHifen, type ProgressoDaMeta } from "./km-e-metas";

describe("km do veiculo", () => {
  it("aceita com ponto de milhar e com 'km'", () => {
    expect(lerKm("12.345")).toBe(12_345);
    expect(lerKm(" 12345 km ")).toBe(12_345);
  });

  it("recusa texto, negativo e acima do limite", () => {
    expect(lerKm("doze")).toBeNull();
    expect(lerKm("-5")).toBeNull();
    expect(lerKm("3000000")).toBeNull();
    expect(lerKm("")).toBeNull();
  });

  it("mostra o km e a placa como se escreve", () => {
    expect(kmNaTela(12_345)).toBe("12.345 km");
    expect(placaComHifen("ABC1D23")).toBe("ABC-1D23");
  });
});

describe("metas pendentes", () => {
  const eu = "eu";
  const linha = (id: number, periodo: string, quantidade: number, feitas: number, usuario = eu): ProgressoDaMeta => ({
    meta_id: id,
    usuario_id: usuario,
    site_id: id * 10,
    periodo,
    quantidade,
    feitas,
  });

  it("so as minhas, so as nao batidas, das que faltam mais para as que faltam menos", () => {
    const lista = [
      linha(1, "SEMANAL", 4, 1),
      linha(2, "DIARIA", 1, 1),
      linha(3, "MENSAL", 10, 9),
      linha(4, "SEMANAL", 4, 0, "outra pessoa"),
    ];
    expect(metasPendentes(lista, eu)).toEqual([
      { metaId: 1, siteId: 10, resumo: "1 de 4 na semana", faltam: 3 },
      { metaId: 3, siteId: 30, resumo: "9 de 10 no mês", faltam: 1 },
    ]);
  });

  it("descreve cada periodo", () => {
    const resumos = metasPendentes(
      [linha(1, "DIARIA", 2, 0), linha(2, "QUINZENAL", 3, 0)],
      eu,
    ).map((m) => m.resumo);
    expect(resumos).toEqual(["0 de 3 na quinzena", "0 de 2 hoje"]);
  });
});
