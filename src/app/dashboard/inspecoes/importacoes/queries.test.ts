import { describe, expect, it } from "vitest";
import { extrairFiltros, rotuloDoStatus, toTableRow, type ImportacaoRow } from "./queries";

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-01",
        data_final: "2026-08-21",
        status: "referencia_desconhecida",
        pagina: "3",
      }),
    ).toEqual({
      dataInicial: "2026-08-01",
      dataFinal: "2026-08-21",
      status: "referencia_desconhecida",
      pagina: 3,
    });
  });

  it("filtros ausentes ficam undefined, pagina cai para 1", () => {
    expect(extrairFiltros({})).toEqual({
      dataInicial: undefined,
      dataFinal: undefined,
      status: undefined,
      pagina: 1,
    });
  });

  it("pagina invalida (nao numerica ou <= 0) cai para 1", () => {
    expect(extrairFiltros({ pagina: "abc" }).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "0" }).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "-3" }).pagina).toBe(1);
  });
});

describe("rotuloDoStatus", () => {
  it("traduz cada status conhecido para o rotulo em portugues", () => {
    expect(rotuloDoStatus("sucesso")).toBe("Sucesso");
    expect(rotuloDoStatus("falha_ao_gravar_leituras")).toBe("Falha ao gravar leituras");
  });

  it("status desconhecido (schema mudou e a tela nao) devolve o proprio valor bruto", () => {
    expect(rotuloDoStatus("status_novo_ainda_sem_rotulo")).toBe("status_novo_ainda_sem_rotulo");
  });
});

describe("toTableRow", () => {
  function linha(sobrescreve: Partial<ImportacaoRow> = {}): ImportacaoRow {
    return {
      id: 1,
      criado_em: "2026-08-21T03:12:00-03:00",
      status: "sucesso",
      http_status: 200,
      origem: "203.0.113.10",
      linhas_recebidas: 42,
      visitas_gravadas: 5,
      leituras_novas: 40,
      mensagem: null,
      ...sobrescreve,
    };
  }

  it("monta a linha na ordem de TABLE_COLUMNS", () => {
    expect(toTableRow(linha())).toEqual([
      expect.any(String), // data formatada -- coberto por lib/data-hora.ts
      "Sucesso",
      "200",
      "203.0.113.10",
      "42",
      "5",
      "40",
      "",
    ]);
  });

  it("mensagem nula vira string vazia, nao 'null'", () => {
    expect(toTableRow(linha({ mensagem: null }))[7]).toBe("");
  });

  it("mensagem de recusa aparece na ultima coluna", () => {
    const row = toTableRow(
      linha({
        status: "referencia_desconhecida",
        http_status: 422,
        visitas_gravadas: 0,
        leituras_novas: 0,
        mensagem: "3 linha(s) com referência desconhecida",
      }),
    );
    expect(row[1]).toBe("Referência desconhecida");
    expect(row[2]).toBe("422");
    expect(row[7]).toBe("3 linha(s) com referência desconhecida");
  });
});
