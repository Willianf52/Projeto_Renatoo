import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { extrairFiltros, formatarDuracao, formatarMedia, montarTempoMedio, paraPlanilha } = await import("./queries");

const HORA = 60 * 60 * 1000;

/** Ocorrencia aberta em 01/10 00:00 e finalizada `horas` depois. */
const ocorrencia = (evento_id: number, nome: string, horas: number) => ({
  evento_id,
  criado_em: "2026-10-01T00:00:00.000Z",
  finalizada_em: new Date(Date.parse("2026-10-01T00:00:00.000Z") + horas * HORA).toISOString(),
  eventos: { nome },
});

describe("montarTempoMedio", () => {
  it("faz a media por tipo de evento, em dias, da maior para a menor", () => {
    const itens = montarTempoMedio(
      [ocorrencia(1, "RH", 24), ocorrencia(1, "RH", 72), ocorrencia(2, "LIMPEZA", 12)],
      "dias",
    );

    expect(itens.map((i) => [i.eventoNome, i.quantidade, i.media])).toEqual([
      ["RH", 2, 2],
      ["LIMPEZA", 1, 0.5],
    ]);
    expect(itens[0].totalMs).toBe(96 * HORA);
  });

  it("troca a unidade para horas", () => {
    const [item] = montarTempoMedio([ocorrencia(1, "RH", 30), ocorrencia(1, "RH", 1)], "horas");
    expect(item.media).toBe(15.5);
  });

  it("arredonda a media para duas casas", () => {
    const [item] = montarTempoMedio([ocorrencia(1, "RH", 1), ocorrencia(1, "RH", 1), ocorrencia(1, "RH", 2)], "dias");
    // 4 h / 3 = 1,333 h = 0,0555 dia
    expect(item.media).toBe(0.06);
  });

  it("conta duracao negativa como zero", () => {
    const [item] = montarTempoMedio([ocorrencia(1, "RH", -5), ocorrencia(1, "RH", 48)], "dias");
    expect(item.media).toBe(1);
  });

  it("desempata a ordem pelo nome do evento", () => {
    const itens = montarTempoMedio([ocorrencia(2, "PORTARIA", 24), ocorrencia(1, "EPI", 24)], "dias");
    expect(itens.map((i) => i.eventoNome)).toEqual(["EPI", "PORTARIA"]);
  });

  it("devolve lista vazia sem ocorrencia finalizada", () => {
    expect(montarTempoMedio([], "dias")).toEqual([]);
  });
});

describe("formatacao", () => {
  it("escreve a duracao em dias, horas e minutos", () => {
    expect(formatarDuracao(0)).toBe("0d 00h 00min");
    expect(formatarDuracao(51 * HORA + 15 * 60_000)).toBe("2d 03h 15min");
  });

  it("escreve a media com virgula e duas casas", () => {
    expect(formatarMedia(2.5)).toBe("2,50");
    expect(formatarMedia(0)).toBe("0,00");
  });
});

describe("extrairFiltros", () => {
  it("usa Dias por padrao e aceita Horas", () => {
    expect(extrairFiltros({}).formato).toBe("dias");
    expect(extrairFiltros({ formato: "horas" }).formato).toBe("horas");
    expect(extrairFiltros({ formato: "semanas" }).formato).toBe("dias");
  });

  it("so aceita status conhecidos", () => {
    expect(extrairFiltros({ status: "ATENDIDO" }).status).toBe("ATENDIDO");
    expect(extrairFiltros({ status: "QUALQUER" }).status).toBeUndefined();
  });
});

describe("paraPlanilha", () => {
  it("usa as colunas da referencia, com a unidade no cabecalho", () => {
    const itens = montarTempoMedio([ocorrencia(1, "RH", 36)], "horas");
    expect(paraPlanilha(itens, "horas")).toEqual({
      colunas: ["Evento", "Qtd Horas", "Tempo Total"],
      linhas: [["RH", "36,00", "1d 12h 00min"]],
    });
  });
});
