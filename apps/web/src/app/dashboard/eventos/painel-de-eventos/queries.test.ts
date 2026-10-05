import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { descricaoAutomatica, extrairFiltros, montarResumo, periodoPadrao, rotuloDaResposta, tempoEmAberto } =
  await import("./queries");

const AGORA = new Date("2026-10-05T12:00:00Z");

describe("periodoPadrao", () => {
  it("os ultimos 60 dias, no horario de Brasilia", () => {
    expect(periodoPadrao(AGORA)).toEqual({ dataInicial: "2026-08-06", dataFinal: "2026-10-05" });
  });

  it("as 22h de Brasilia ainda e o mesmo dia", () => {
    expect(periodoPadrao(new Date("2026-10-06T01:00:00Z")).dataFinal).toBe("2026-10-05");
  });
});

describe("extrairFiltros", () => {
  it("sem nada na URL, abre nos ultimos 60 dias e na pagina 1", () => {
    expect(extrairFiltros({}, AGORA)).toMatchObject({ dataInicial: "2026-08-06", dataFinal: "2026-10-05", pagina: 1 });
  });

  it("descarta valor torto em vez de mandar para a consulta", () => {
    const f = extrairFiltros(
      { status: "QUALQUER", numero: "12a", ano: "26", sites: "abc", pagina: "-3", data_inicial: "2026-13-40" },
      AGORA,
    );
    expect(f).toMatchObject({ status: undefined, numero: undefined, ano: undefined, sites: undefined, pagina: 1 });
    expect(f.dataInicial).toBe("2026-08-06");
  });

  it("aceita os valores validos", () => {
    expect(
      extrairFiltros({ status: "AGUARDANDO", numero: "650", ano: "2026", sites: "12", busca: "  senha  ", pagina: "2" }, AGORA),
    ).toMatchObject({ status: "AGUARDANDO", numero: "650", ano: "2026", sites: "12", busca: "senha", pagina: 2 });
  });
});

describe("tempoEmAberto", () => {
  it("dias, horas e minutos desde a abertura", () => {
    expect(tempoEmAberto("2026-08-31T11:28:00Z", AGORA)).toEqual({ dias: 35, horas: 0, minutos: 32 });
  });

  it("relogio adiantado no aparelho nao vira tempo negativo", () => {
    expect(tempoEmAberto("2026-10-05T13:00:00Z", AGORA)).toEqual({ dias: 0, horas: 0, minutos: 0 });
  });
});

describe("descricaoAutomatica", () => {
  it("o texto do sistema de referencia, com a observacao quando houver", () => {
    expect(
      descricaoAutomatica({ checklistId: 30, pergunta: "Duvidas com o RH", resposta: "SIM", observacao: "Senha do ponto" }),
    ).toEqual([
      "Evento gerado automaticamente pelo Checklist nº 30",
      "Pergunta: Duvidas com o RH",
      "Resposta: Sim",
      "Observações: Senha do ponto",
    ]);
    expect(descricaoAutomatica({ checklistId: 1, pergunta: "P", resposta: "NAO", observacao: null })).toHaveLength(3);
    expect(rotuloDaResposta("NAO")).toBe("Não conforme");
  });
});

describe("montarResumo", () => {
  it("conta por status na ordem do sistema de referencia, so os que aparecem", () => {
    expect(montarResumo([{ status: "EM_ANALISE" }, { status: "AGUARDANDO" }, { status: "AGUARDANDO" }])).toEqual([
      { status: "AGUARDANDO", quantidade: 2 },
      { status: "EM_ANALISE", quantidade: 1 },
    ]);
  });
});
