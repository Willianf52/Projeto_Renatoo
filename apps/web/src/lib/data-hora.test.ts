import { describe, expect, it } from "vitest";

import { dataValida, formatarDataHora, horaValida, mesAtual } from "./data-hora";

/**
 * O ponto desta suite nao e o formato -- e o FUSO.
 *
 * Estas funcoes rodam no servidor, que na Vercel esta em UTC, enquanto quem
 * le a tabela esta em Brasilia. Enquanto o `timeZone` era implicito, o painel
 * mostrava o carimbo tres horas adiantado e, perto da meia-noite, no dia
 * errado -- sem nenhum sinal de que algo estava errado, porque uma data
 * plausivel e indistinguivel de uma data correta.
 *
 * Por isso todos os casos abaixo usam instante com `Z` (UTC) e conferem a
 * saida em Brasilia: se alguem tirar o `timeZone`, a maquina de quem roda o
 * teste deixa de importar e a asercao quebra do mesmo jeito na CI e no
 * notebook de quem desenvolve.
 */

describe("formatarDataHora", () => {
  it("converte de UTC para o fuso de Brasilia", () => {
    expect(formatarDataHora("2026-09-08T14:30:00Z")).toBe("08/09/2026, 11:30");
  });

  /**
   * O caso que motivou a correcao: 01:30 UTC ainda e o dia ANTERIOR aqui.
   * Sem `timeZone`, o servidor imprimia "08/09/2026, 01:30" -- dia e hora
   * errados de uma vez.
   */
  it("volta um dia quando o instante em UTC ja passou da meia-noite", () => {
    expect(formatarDataHora("2026-09-08T01:30:00Z")).toBe("07/09/2026, 22:30");
  });

  it("nulo vira celula vazia, nao 'Invalid Date'", () => {
    expect(formatarDataHora(null)).toBe("");
  });

  it("aceita o carimbo com offset que o Postgres devolve", () => {
    expect(formatarDataHora("2026-09-08T08:12:00-03:00")).toBe("08/09/2026, 08:12");
  });
});

describe("mesAtual", () => {
  it("usa o mes de Brasilia, e nao o do servidor", () => {
    // 21:00 em Brasilia no ultimo dia de setembro -- ja e 1o de outubro em UTC.
    expect(mesAtual(new Date("2026-10-01T00:00:00Z"))).toBe("2026-09");
  });

  it("vira o mes na hora certa", () => {
    // 00:00 de 1o de outubro em Brasilia = 03:00 UTC.
    expect(mesAtual(new Date("2026-10-01T03:00:00Z"))).toBe("2026-10");
  });

  it("preenche o mes com dois digitos", () => {
    expect(mesAtual(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03");
  });
});

/**
 * Estas duas nao sao sobre fuso, e sim sobre o que chega pela querystring.
 *
 * Os filtros de periodo montam o limite da consulta por interpolacao, entao
 * um valor que so PARECE data derruba a tela com erro do Postgres em vez de
 * ser ignorado -- ver o cabecalho de `dataValida`.
 */
describe("dataValida", () => {
  it("aceita a data que o FilterDatePicker emite", () => {
    expect(dataValida("2026-09-09")).toBe("2026-09-09");
    expect(dataValida("2028-02-29")).toBe("2028-02-29"); // 29/02 de ano bissexto existe
  });

  it("recusa o que nao tem o formato", () => {
    expect(dataValida(undefined)).toBeUndefined();
    expect(dataValida("")).toBeUndefined();
    expect(dataValida("abc")).toBeUndefined();
    expect(dataValida("09/09/2026")).toBeUndefined();
    expect(dataValida("2026-9-9")).toBeUndefined();
    expect(dataValida("2026-09-09T10:00:00Z")).toBeUndefined();
  });

  it("recusa data que existe no formato mas nao no calendario", () => {
    // O regex sozinho deixaria as tres passarem -- e o ida e volta pelo ISO
    // que as pega.
    expect(dataValida("2026-13-01")).toBeUndefined();
    expect(dataValida("2026-02-31")).toBeUndefined();
    expect(dataValida("2026-00-10")).toBeUndefined();
    // 2026 nao e bissexto -- a checagem e de calendario, nao so de faixa.
    expect(dataValida("2026-02-29")).toBeUndefined();
  });
});

describe("horaValida", () => {
  it("aceita a hora que o FilterTimePicker emite", () => {
    expect(horaValida("00:00")).toBe("00:00");
    expect(horaValida("23:59")).toBe("23:59");
  });

  it("recusa formato torto e faixa fora do relogio", () => {
    expect(horaValida(undefined)).toBeUndefined();
    expect(horaValida("zz")).toBeUndefined();
    expect(horaValida("7:30")).toBeUndefined();
    expect(horaValida("24:00")).toBeUndefined();
    expect(horaValida("12:60")).toBeUndefined();
  });
});
