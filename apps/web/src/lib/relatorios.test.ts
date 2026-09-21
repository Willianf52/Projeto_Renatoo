import { describe, expect, it } from "vitest";
import { avisoDePeriodo, filtrosParaRpc, periodoInvertido } from "./relatorios";

describe("filtrosParaRpc", () => {
  it("mantem so os filtros escolhidos", () => {
    expect(filtrosParaRpc({ site: "3", evento: undefined, funcionario: "abc" })).toEqual({
      site: "3",
      funcionario: "abc",
    });
  });

  it("select vazio ou so espaco fica de fora, em vez de ir como chave presente", () => {
    expect(filtrosParaRpc({ site: "", evento: "  " })).toEqual({});
  });
});

describe("avisoDePeriodo", () => {
  const base = { oQueMostra: "as horas por usuário" };

  it("primeira abertura orienta, sem tom de erro", () => {
    const aviso = avisoDePeriodo({ ...base, params: {}, dataInicial: undefined, dataFinal: undefined });

    expect(aviso.titulo).toBe("Selecione um período");
    expect(aviso.descricao).toContain("para ver as horas por usuário.");
    expect(aviso.destaque).toBe(false);
  });

  it("filtrar sem data nenhuma avisa que o clique foi recebido", () => {
    const aviso = avisoDePeriodo({
      ...base,
      params: { data_inicial: "", data_final: "", funcionario: "" },
      dataInicial: undefined,
      dataFinal: undefined,
    });

    expect(aviso.titulo).toBe("Informe o período para filtrar");
    expect(aviso.destaque).toBe(true);
  });

  it("aponta qual das duas datas faltou", () => {
    expect(
      avisoDePeriodo({
        ...base,
        params: { data_inicial: "2026-09-01", data_final: "" },
        dataInicial: "2026-09-01",
        dataFinal: undefined,
      }).titulo,
    ).toBe("Falta a Data Final");

    expect(
      avisoDePeriodo({
        ...base,
        params: { data_inicial: "", data_final: "2026-09-30" },
        dataInicial: undefined,
        dataFinal: "2026-09-30",
      }).titulo,
    ).toBe("Falta a Data Inicial");
  });

  it("data malformada na URL conta como faltando", () => {
    const aviso = avisoDePeriodo({
      ...base,
      params: { data_inicial: "ontem", data_final: "2026-09-30" },
      dataInicial: undefined,
      dataFinal: "2026-09-30",
    });

    expect(aviso.titulo).toBe("Falta a Data Inicial");
  });
});

describe("periodoInvertido", () => {
  it("mesmo dia nao e invertido", () => {
    expect(periodoInvertido("2026-09-01", "2026-09-01")).toBe(false);
  });

  it("compara pelo calendario, inclusive virando o mes e o ano", () => {
    expect(periodoInvertido("2026-09-30", "2026-10-01")).toBe(false);
    expect(periodoInvertido("2026-10-01", "2026-09-30")).toBe(true);
    expect(periodoInvertido("2027-01-01", "2026-12-31")).toBe(true);
  });
});

describe("avisoDePeriodo com periodo invertido", () => {
  it("diz que as datas estao trocadas, em destaque", () => {
    const aviso = avisoDePeriodo({
      oQueMostra: "o ranking do período",
      params: { data_inicial: "2026-09-30", data_final: "2026-09-01" },
      dataInicial: "2026-09-30",
      dataFinal: "2026-09-01",
    });

    expect(aviso.titulo).toBe("Período invertido");
    expect(aviso.destaque).toBe(true);
  });
});
