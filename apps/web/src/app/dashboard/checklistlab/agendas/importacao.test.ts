import { describe, expect, it } from "vitest";
import { lerData, planejarImportacao, type Cadastros } from "./importacao";

const CABECALHO = [
  "nome",
  "checklist(nome)",
  "data_planejada",
  "tolerancia(dias)",
  "responsavel(nome)",
  "grupo Usuários(nome)",
  "site(nome)",
  "padrao_recorrencia",
  "dias_uteis",
  "interrupção",
  "intervalo",
  "data termina",
  "dias/horas",
];

const CADASTROS: Cadastros = {
  modelos: [{ id: 7, nome: "Primeiro Checklist" }],
  sites: [
    { id: 1, nome: "Base Norte" },
    { id: 2, nome: "Portaria Sul" },
  ],
  usuarios: [{ id: "11111111-2222-4333-8444-555555555555", nome: "Ana Lima" }],
  grupos: [{ id: 3, nome: "Administradores" }],
};

describe("lerData", () => {
  it("lê o número do Excel, dd/mm/aaaa e aaaa-mm-dd", () => {
    expect(lerData("46191.625")).toBe("2026-06-18");
    expect(lerData("46191,625")).toBe("2026-06-18");
    expect(lerData("18/06/2026 15:00")).toBe("2026-06-18");
    expect(lerData("2026-06-18")).toBe("2026-06-18");
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("")).toBeNull();
  });
});

describe("planejarImportacao (planilha do antigo)", () => {
  it("lê as linhas no formato da planilha de exemplo", () => {
    const plano = planejarImportacao(
      [
        CABECALHO,
        ["Diária", "Primeiro Checklist", "46191.625", "2", "Ana Lima", "", "Base Norte;Portaria Sul", "1", "0", "0", "0", "46252.625", "D"],
        ["Semanal em horas", "primeiro checklist", "20/06/2026", "36", "", "Administradores", "PORTARIA SUL", "7", "1", "12", "50", "20/07/2026", "H"],
        ["Única", "Primeiro Checklist", "2026-06-22", "2", "", "", "Base Norte", "0", "0", "0", "0", "", "H"],
      ],
      CADASTROS,
    );
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.erros).toEqual([]);
    expect(plano.agendas.map((a) => [a.nome, a.recorrencia, a.dataInicial, a.dataFinal, a.toleranciaDias, a.sites])).toEqual([
      ["Diária", "DIARIO", "2026-06-18", "2026-08-18", 2, [1, 2]],
      ["Semanal em horas", "SEMANAL", "2026-06-20", "2026-07-20", 2, [2]],
      ["Única", "DIARIO", "2026-06-22", "2026-06-22", 1, [1]],
    ]);
    expect(plano.agendas[0].responsavelId).toBe("11111111-2222-4333-8444-555555555555");
    expect(plano.agendas[1].grupoUsuarioId).toBe(3);
  });

  it("aponta checklist, site e recorrência que não existem", () => {
    const plano = planejarImportacao(
      [
        CABECALHO,
        ["A", "Outro", "2026-06-18", "0", "", "", "Base Norte", "1", "", "", "", "2026-07-01", "D"],
        ["B", "Primeiro Checklist", "2026-06-18", "0", "", "", "Base Leste", "1", "", "", "", "2026-07-01", "D"],
        ["C", "Primeiro Checklist", "2026-06-18", "0", "", "", "Base Norte", "45", "", "", "", "2026-07-01", "D"],
        ["D", "Primeiro Checklist", "2026-06-18", "0", "", "", "Base Norte", "7", "", "", "", "", "D"],
      ],
      CADASTROS,
    );
    expect(plano).toMatchObject({ ok: true, agendas: [], erros: [{ linha: 2 }, { linha: 3 }, { linha: 4 }, { linha: 5 }] });
  });

  it("sem as colunas obrigatórias, recusa o arquivo", () => {
    expect(planejarImportacao([["nome", "checklist"]], CADASTROS)).toMatchObject({ ok: false });
  });
});
