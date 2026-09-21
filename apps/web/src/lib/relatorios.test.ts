import { describe, expect, it } from "vitest";
import { avisoDePeriodo, filtrosParaRpc } from "./relatorios";

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
    const aviso = avisoDePeriodo({ ...base, params: {}, temDataInicial: false, temDataFinal: false });

    expect(aviso.titulo).toBe("Selecione um período");
    expect(aviso.descricao).toContain("para ver as horas por usuário.");
    expect(aviso.destaque).toBe(false);
  });

  it("filtrar sem data nenhuma avisa que o clique foi recebido", () => {
    const aviso = avisoDePeriodo({
      ...base,
      params: { data_inicial: "", data_final: "", funcionario: "" },
      temDataInicial: false,
      temDataFinal: false,
    });

    expect(aviso.titulo).toBe("Informe o período para filtrar");
    expect(aviso.destaque).toBe(true);
  });

  it("aponta qual das duas datas faltou", () => {
    expect(
      avisoDePeriodo({
        ...base,
        params: { data_inicial: "2026-09-01", data_final: "" },
        temDataInicial: true,
        temDataFinal: false,
      }).titulo,
    ).toBe("Falta a Data Final");

    expect(
      avisoDePeriodo({
        ...base,
        params: { data_inicial: "", data_final: "2026-09-30" },
        temDataInicial: false,
        temDataFinal: true,
      }).titulo,
    ).toBe("Falta a Data Inicial");
  });

  it("data malformada na URL conta como faltando", () => {
    const aviso = avisoDePeriodo({
      ...base,
      params: { data_inicial: "ontem", data_final: "2026-09-30" },
      temDataInicial: false,
      temDataFinal: true,
    });

    expect(aviso.titulo).toBe("Falta a Data Inicial");
  });
});
