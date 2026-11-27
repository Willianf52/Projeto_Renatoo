import { describe, expect, it, vi } from "vitest";
import { extrairFiltros, hojeEmBrasilia, juntarTelasPeloNome, nomeDaTela, periodoValido, resumo, rotuloDoCargo } from "./queries";

// O primeiro import do menu (icones) passa dos 5 s padrao numa maquina lenta.
vi.setConfig({ testTimeout: 30_000 });

// 27/11/2026 01:00 em UTC ainda e 26/11 em Brasilia.
const MADRUGADA_UTC = new Date("2026-11-27T01:00:00Z");

describe("filtros", () => {
  it("sem datas, os ultimos 30 dias contados em Brasilia", () => {
    expect(hojeEmBrasilia(MADRUGADA_UTC)).toBe("2026-11-26");
    expect(extrairFiltros({}, MADRUGADA_UTC)).toEqual({ dataInicial: "2026-10-28", dataFinal: "2026-11-26", cargo: undefined });
  });

  it("le datas validas e so cargo que existe", () => {
    expect(extrairFiltros({ data_inicial: "2026-11-01", data_final: "2026-11-10", cargo: "GESTOR" }, MADRUGADA_UTC)).toEqual({
      dataInicial: "2026-11-01",
      dataFinal: "2026-11-10",
      cargo: "GESTOR",
    });
    expect(extrairFiltros({ cargo: "ADMIN", data_inicial: "2026-02-30" }, MADRUGADA_UTC).cargo).toBeUndefined();
    expect(extrairFiltros({ data_inicial: "2026-02-30" }, MADRUGADA_UTC).dataInicial).toBe("2026-10-28");
  });

  it("periodo: fim depois do inicio e no maximo 366 dias, como o banco", () => {
    expect(periodoValido({ dataInicial: "2026-11-01", dataFinal: "2026-11-01" })).toBe(true);
    expect(periodoValido({ dataInicial: "2026-11-02", dataFinal: "2026-11-01" })).toBe(false);
    expect(periodoValido({ dataInicial: "2025-11-26", dataFinal: "2026-11-27" })).toBe(true);
    expect(periodoValido({ dataInicial: "2025-11-25", dataFinal: "2026-11-27" })).toBe(false);
  });
});

describe("nomeDaTela", () => {
  it("usa o nome do menu", () => {
    expect(nomeDaTela("/dashboard/cadastros/qr-code")).toBe("QR-Code");
    expect(nomeDaTela("/dashboard")).toBe("Início");
  });

  it("detalhe, edicao, novo e importar viram sufixo", () => {
    expect(nomeDaTela("/dashboard/cadastros/qr-code/:id/editar")).toBe("QR-Code (editar)");
    expect(nomeDaTela("/dashboard/eventos/painel-de-eventos/:id")).toBe("Painel de Eventos (detalhe)");
    expect(nomeDaTela("/dashboard/cadastros/site-planta/novo")).toBe("Site / Planta (novo)");
    expect(nomeDaTela("/dashboard/cadastros/site-planta/importar")).toBe("Site / Planta (importar)");
  });

  it("sub-pagina sem sufixo conhecido mostra o pedaco que sobra; rota desconhecida aparece como veio", () => {
    expect(nomeDaTela("/dashboard/cadastros/site-planta/emails-em-massa")).toBe("Site / Planta (emails-em-massa)");
    expect(nomeDaTela("/dashboard/nao-existe")).toBe("/dashboard/nao-existe");
  });
});

describe("somas", () => {
  it("junta rotas com o mesmo nome sem contar pessoas duas vezes", () => {
    expect(
      juntarTelasPeloNome([
        { tela: "B", aberturas: 2, pessoas: 1 },
        { tela: "A", aberturas: 3, pessoas: 2 },
        { tela: "B", aberturas: 4, pessoas: 3 },
      ]),
    ).toEqual([
      { tela: "B", aberturas: 6, pessoas: 3 },
      { tela: "A", aberturas: 3, pessoas: 2 },
    ]);
  });

  it("resumo soma as linhas por pessoa", () => {
    const linha = { nome: "x", cargo: "Gestor", diasComAcesso: 1, ultimoAcesso: "" };
    expect(resumo({ pessoas: [{ ...linha, logins: 2, telas: 5 }, { ...linha, logins: 1, telas: 3 }], telas: [] })).toEqual({
      pessoas: 2,
      logins: 3,
      telas: 8,
    });
  });

  it("rotulo do cargo", () => {
    expect(rotuloDoCargo("SUPERVISOR")).toBe("Supervisor");
    expect(rotuloDoCargo(null)).toBe("");
  });
});
