import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { diaEmBrasilia, duracaoDesde, formatarDuracao, montarLinhas, paraLinhasDeExportacao } = await import("./queries");

// 15/10/2026 17:34 em Brasilia -- o momento em que a referencia foi conferida.
const AGORA = new Date("2026-10-15T20:34:00Z");

describe("duracaoDesde", () => {
  it("conta da meia-noite do dia ate agora, como a referencia", () => {
    const d = duracaoDesde("2026-10-01", AGORA);
    expect(formatarDuracao(d)).toBe("14 dias, 17 horas e 34 minutos");
    expect(d.totalDeHoras).toBe(353);
  });

  it("usa meses de calendario", () => {
    expect(formatarDuracao(duracaoDesde("2026-08-03", AGORA))).toBe("2 meses, 12 dias, 17 horas e 34 minutos");
  });

  it("empresta os dias do mes de partida, como o PHP da referencia (31/08 -> 1 mes e 15 dias)", () => {
    const d = duracaoDesde("2026-08-31", AGORA);
    expect(formatarDuracao(d)).toBe("1 mês, 15 dias, 17 horas e 34 minutos");
    expect(d.totalDeHoras).toBe(1097);
  });

  it("no proprio dia so mostra horas e minutos, com singular", () => {
    expect(formatarDuracao(duracaoDesde("2026-10-15", new Date("2026-10-15T04:01:00Z")))).toBe("1 hora e 1 minuto");
  });

  it("dia no futuro nao fica negativo", () => {
    expect(duracaoDesde("2026-10-20", AGORA).totalDeHoras).toBe(0);
  });
});

describe("diaEmBrasilia", () => {
  it("ocorrencia das 22h de Brasilia cai no dia local, nao no UTC", () => {
    expect(diaEmBrasilia("2026-10-02T01:00:00Z")).toBe("2026-10-01");
  });
});

describe("montarLinhas", () => {
  const site = (nome: string) => ({ nome, grupos_sites: { nome: "Grupo" } });

  it("agrupa por dia, local, usuario e evento, somando a quantidade", () => {
    const linhas = montarLinhas(
      [
        { criado_em: "2026-10-02T12:00:00Z", site_id: 2, sites: site("B"), eventos: { nome: "RH" }, autor: { nome_completo: "Ana" } },
        { criado_em: "2026-10-01T12:00:00Z", site_id: 1, sites: site("A"), eventos: { nome: "Portaria" }, autor: { nome_completo: "Ana" } },
        { criado_em: "2026-10-01T15:00:00Z", site_id: 1, sites: site("A"), eventos: { nome: "Portaria" }, autor: { nome_completo: "Ana" } },
        { criado_em: "2026-10-01T15:00:00Z", site_id: 1, sites: site("A"), eventos: { nome: "Portaria" }, autor: { nome_completo: "Bia" } },
      ],
      AGORA,
    );

    expect(linhas.map((l) => [l.dia, l.usuario, l.evento, l.quantidade])).toEqual([
      ["2026-10-01", "Ana", "Portaria", 2],
      ["2026-10-01", "Bia", "Portaria", 1],
      ["2026-10-02", "Ana", "RH", 1],
    ]);
    expect(linhas[0].siteNiveis).toEqual(["UP Serviços", "Grupo", "A"]);
  });

  it("exporta no formato da tela", () => {
    const [linha] = paraLinhasDeExportacao(
      montarLinhas(
        [{ criado_em: "2026-10-01T12:00:00Z", site_id: 1, sites: site("A"), eventos: { nome: "RH" }, autor: null }],
        AGORA,
      ),
    );
    expect(linha).toEqual([
      "01/10/2026",
      "UP Serviços > Grupo > A",
      "",
      "14 dias, 17 horas e 34 minutos",
      "353 horas",
      "RH",
      "1",
    ]);
  });
});
