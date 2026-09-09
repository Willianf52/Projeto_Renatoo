import { describe, expect, it } from "vitest";

import { formatarDataHora, mesAtual } from "./data-hora";

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
