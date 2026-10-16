import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const {
  analiticoPorChecklist,
  detalhamento,
  diaEmBrasilia,
  extrairFiltros,
  indicadoresPorSite,
  linhasDoAnalitico,
  mediaDasNotas,
  percentualConforme,
} = await import("./dados");

type Checklist = Parameters<typeof mediaDasNotas>[0][number];

const pergunta = (id: number, ordem: number, extra: Partial<Checklist["respostas"][number]["pergunta"]> = {}) => ({
  id,
  ordem,
  texto: `Pergunta ${id}`,
  tipo: "CNA" as const,
  grupoId: null,
  grupo: "",
  grupoOrdem: Number.MAX_SAFE_INTEGER,
  ...extra,
});

const limpeza = { grupoId: 1, grupo: "Limpeza", grupoOrdem: 2 };
const portaria = { grupoId: 2, grupo: "Portaria", grupoOrdem: 1 };

function checklist(id: number, dia: string, siteId: number, modeloId: number, respostas: [ReturnType<typeof pergunta>, string][]): Checklist {
  return {
    id,
    dia,
    modeloId,
    modelo: modeloId === 1 ? "ACE Limpeza" : "Frota",
    siteId,
    site: siteId === 1 ? "Grupo - Posto A" : "Grupo - Posto B",
    respostas: respostas.map(([p, resposta]) => ({ pergunta: p, resposta })),
  };
}

const p1 = pergunta(11, 1, limpeza);
const p2 = pergunta(12, 2, portaria);
const p3 = pergunta(13, 3);
const sn = pergunta(14, 4, { tipo: "SN" });

const dados = [
  checklist(1, "2026-10-14", 1, 1, [[p1, "SIM"], [p2, "NAO"], [p3, "NA"], [sn, "SIM"]]),
  checklist(2, "2026-10-15", 1, 1, [[p1, "SIM"], [p2, "SIM"], [p3, "SIM"], [sn, "NAO"]]),
  checklist(3, "2026-10-15", 2, 2, [[p1, "NAO"]]),
];

describe("percentualConforme", () => {
  it("Conforme sobre Conforme + Nao conforme; N/A fora; Sim/Nao e so N/A ficam vazios", () => {
    expect(percentualConforme("CNA", ["SIM", "NAO", "NA", "SIM"])).toBe(67);
    expect(percentualConforme("CNA", ["NA", "NA"])).toBeNull();
    expect(percentualConforme("SN", ["SIM"])).toBeNull();
  });
});

describe("mediaDasNotas", () => {
  it("e a media das notas de cada checklist, pela regra da nota", () => {
    // Checklist 1: p1 SIM, p2 NAO -> 50. Checklist 2: tres SIM -> 100.
    expect(mediaDasNotas(dados.slice(0, 2))).toBe(75);
    expect(mediaDasNotas([checklist(9, "2026-10-15", 1, 1, [[sn, "SIM"]])])).toBeNull();
  });
});

describe("analiticoPorChecklist", () => {
  it("um cartao por checklist, grupos na ordem do cadastro e Sem grupo no fim", () => {
    const [ace, frota] = analiticoPorChecklist(dados);
    expect(ace.modelo).toBe("ACE Limpeza");
    expect(ace.respondidos).toBe(2);
    expect(ace.grupos.map((g) => g.nome)).toEqual(["Portaria", "Limpeza", "Sem grupo"]);
    expect(ace.grupos[0].perguntas).toEqual([{ id: 12, ordem: 2, texto: "Pergunta 12", percentual: 50 }]);
    expect(ace.grupos[2].perguntas.map((p) => [p.id, p.percentual])).toEqual([
      [13, 100],
      [14, null],
    ]);
    expect(frota.grupos[0].perguntas[0].percentual).toBe(0);
  });

  it("exporta uma linha por pergunta", () => {
    expect(linhasDoAnalitico(analiticoPorChecklist(dados))[0]).toEqual(["ACE Limpeza", "2", "Portaria", "2", "Pergunta 12", "50%"]);
  });
});

describe("indicadoresPorSite", () => {
  it("media geral do site e um medidor por checklist respondido nele", () => {
    const [a, b] = indicadoresPorSite(dados);
    expect([a.site, a.media, a.respondidos]).toEqual(["Grupo - Posto A", 75, 2]);
    expect(a.modelos).toEqual([{ modeloId: 1, modelo: "ACE Limpeza", media: 75, respondidos: 2 }]);
    expect([b.site, b.media]).toEqual(["Grupo - Posto B", 0]);
  });
});

describe("detalhamento", () => {
  it("um cartao por site x checklist, % por pergunta em cada dia, vazio sem resposta", () => {
    const dias = ["2026-10-14", "2026-10-15", "2026-10-16"];
    const [cartao] = detalhamento(dados, dias);
    expect([cartao.site, cartao.modelo, cartao.media]).toEqual(["Grupo - Posto A", "ACE Limpeza", 75]);
    expect(cartao.perguntas.find((p) => p.id === 12)?.porDia).toEqual([0, 100, null]);
    expect(cartao.perguntas.find((p) => p.id === 13)?.porDia).toEqual([null, 100, null]);
  });
});

describe("filtros", () => {
  it("abre nos ultimos 7 dias ate hoje em Brasilia e com os checklists ativos", () => {
    const f = extrairFiltros({}, new Date("2026-10-16T02:00:00Z"));
    expect([f.dataInicial, f.dataFinal, f.situacao]).toEqual(["2026-10-08", "2026-10-15", "ativos"]);
  });

  it("dia do envio em Brasilia", () => {
    expect(diaEmBrasilia("2026-10-16T01:30:00Z")).toBe("2026-10-15");
  });
});
