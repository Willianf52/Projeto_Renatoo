import { describe, expect, it } from "vitest";
import {
  inicioDaSemana,
  intervaloDaVisao,
  navegar,
  numeroDoDia,
  semanasDoMes,
  somarDias,
  tituloDaVisao,
  visaoDe,
} from "./calendario";

// 11/11/2026 e uma quarta-feira.
const HOJE = "2026-11-11";

describe("calendario dos agendamentos", () => {
  it("visao desconhecida vira Mes", () => {
    expect(visaoDe(undefined)).toBe("mes");
    expect(visaoDe("ano")).toBe("mes");
    expect(visaoDe("semana")).toBe("semana");
  });

  it("soma dias atravessando o mes e o ano", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("a semana comeca no domingo", () => {
    expect(inicioDaSemana(HOJE)).toBe("2026-11-08");
    expect(inicioDaSemana("2026-11-08")).toBe("2026-11-08");
  });

  it("o intervalo de cada visao", () => {
    expect(intervaloDaVisao("dia", HOJE)).toEqual({ inicio: HOJE, fim: HOJE });
    expect(intervaloDaVisao("semana", HOJE)).toEqual({ inicio: "2026-11-08", fim: "2026-11-14" });
    expect(intervaloDaVisao("lista", HOJE)).toEqual({ inicio: "2026-11-01", fim: "2026-11-30" });
    // Novembro de 2026: do domingo 01/11 ao sabado 05/12.
    expect(intervaloDaVisao("mes", HOJE)).toEqual({ inicio: "2026-11-01", fim: "2026-12-05" });
  });

  it("a grade do mes tem semanas completas de domingo a sabado", () => {
    const semanas = semanasDoMes("2026-02-10");
    expect(semanas[0][0]).toBe("2026-02-01");
    expect(semanas.at(-1)?.at(-1)).toBe("2026-02-28");
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanasDoMes(HOJE)).toHaveLength(5);
  });

  it("navega por mes, semana e dia", () => {
    expect(navegar("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(navegar("mes", HOJE, -1)).toBe("2026-10-01");
    expect(navegar("lista", "2026-12-15", 1)).toBe("2027-01-01");
    expect(navegar("semana", HOJE, 1)).toBe("2026-11-18");
    expect(navegar("dia", HOJE, -1)).toBe("2026-11-10");
  });

  it("titulos em portugues", () => {
    expect(tituloDaVisao("mes", HOJE)).toBe("NOVEMBRO DE 2026");
    expect(tituloDaVisao("dia", HOJE)).toBe("quarta-feira, 11 de novembro de 2026");
    expect(tituloDaVisao("semana", HOJE)).toContain("2026");
    expect(numeroDoDia("2026-11-01")).toBe("1");
  });
});
