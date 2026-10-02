import { describe, expect, it } from "vitest";

import { alternarFixado, mesAnterior, montarGrade, TAMANHO_DA_GRADE, telaDaRota, usoPorTela } from "./atalhos";

const MENU = Array.from({ length: 15 }, (_, i) => `/dashboard/tela-${i}`);

describe("telaDaRota", () => {
  it("rota abaixo da tela conta para ela, e vence o href mais longo", () => {
    const hrefs = ["/dashboard/eventos/mapa", "/dashboard/eventos/mapa-por-site"];
    expect(telaDaRota("/dashboard/eventos/mapa/export/pdf", hrefs)).toBe("/dashboard/eventos/mapa");
    expect(telaDaRota("/dashboard/eventos/mapa-por-site", hrefs)).toBe("/dashboard/eventos/mapa-por-site");
    expect(telaDaRota("/dashboard", hrefs)).toBeNull();
  });
});

describe("usoPorTela", () => {
  it("soma subrotas na tela e descarta o que nao esta no menu", () => {
    const uso = usoPorTela(
      [
        { rota: "/dashboard/tela-1", vezes: 2 },
        { rota: "/dashboard/tela-1/12/editar", vezes: 3 },
        { rota: "/dashboard", vezes: 50 },
      ],
      MENU,
    );
    expect([...uso]).toEqual([["/dashboard/tela-1", 5]]);
  });
});

describe("montarGrade", () => {
  it("sem fixados nem uso, sao as 12 primeiras do menu, na ordem do menu", () => {
    expect(montarGrade(MENU, [], [])).toEqual(MENU.slice(0, TAMANHO_DA_GRADE));
  });

  it("as mais usadas vem primeiro; empate segue a ordem do menu", () => {
    const grade = montarGrade(MENU, [], [
      { rota: "/dashboard/tela-14", vezes: 9 },
      { rota: "/dashboard/tela-10", vezes: 4 },
      { rota: "/dashboard/tela-12", vezes: 4 },
    ]);
    expect(grade.slice(0, 4)).toEqual([
      "/dashboard/tela-14",
      "/dashboard/tela-10",
      "/dashboard/tela-12",
      "/dashboard/tela-0",
    ]);
    expect(grade).toHaveLength(TAMANHO_DA_GRADE);
  });

  it("fixado fica na posicao dele, mesmo sem uso, e nao aparece duas vezes", () => {
    const grade = montarGrade(
      MENU,
      [{ rota: "/dashboard/tela-13", posicao: 2 }],
      [{ rota: "/dashboard/tela-5", vezes: 7 }],
    );
    expect(grade[2]).toBe("/dashboard/tela-13");
    expect(grade[0]).toBe("/dashboard/tela-5");
    expect(new Set(grade).size).toBe(grade.length);
  });

  it("fixado de tela que saiu do menu, ou fora da grade, e ignorado", () => {
    const grade = montarGrade(
      MENU,
      [
        { rota: "/dashboard/tela-removida", posicao: 0 },
        { rota: "/dashboard/tela-9", posicao: 12 },
      ],
      [],
    );
    expect(grade).toEqual(MENU.slice(0, TAMANHO_DA_GRADE));
  });

  it("menu menor que a grade nao inventa posicoes", () => {
    expect(montarGrade(MENU.slice(0, 3), [], [])).toEqual(MENU.slice(0, 3));
  });
});

describe("mesAnterior", () => {
  it("e o mes anterior no horario de Brasilia", () => {
    const { inicio, fim } = mesAnterior(new Date("2026-10-02T12:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("as 22h do dia 31/10 em Brasilia (01/11 em UTC) ainda e outubro", () => {
    const { inicio } = mesAnterior(new Date("2026-11-01T01:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("janeiro volta para dezembro do ano anterior", () => {
    const { inicio, fim } = mesAnterior(new Date("2027-01-15T12:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("alternarFixado", () => {
  const grade = MENU.slice(0, TAMANHO_DA_GRADE);

  it("fixa na posicao em que a tela esta", () => {
    expect(alternarFixado([], grade, "/dashboard/tela-4")).toEqual([{ rota: "/dashboard/tela-4", posicao: 4 }]);
  });

  it("tela fora da grade vai para a primeira posicao livre", () => {
    const fixados = [{ rota: "/dashboard/tela-0", posicao: 0 }];
    expect(alternarFixado(fixados, grade, "/dashboard/tela-14")).toEqual([
      ...fixados,
      { rota: "/dashboard/tela-14", posicao: 1 },
    ]);
  });

  it("clicar de novo desfixa", () => {
    expect(alternarFixado([{ rota: "/dashboard/tela-4", posicao: 4 }], grade, "/dashboard/tela-4")).toEqual([]);
  });

  it("com as 12 fixadas, nao fixa mais nenhuma", () => {
    const todas = grade.map((rota, posicao) => ({ rota, posicao }));
    expect(alternarFixado(todas, grade, "/dashboard/tela-14")).toEqual(todas);
  });
});
