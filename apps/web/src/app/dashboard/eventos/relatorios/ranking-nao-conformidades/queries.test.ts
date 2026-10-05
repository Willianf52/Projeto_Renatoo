import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { montarRanking, paraPlanilha } = await import("./queries");

const linha = (evento_id: number, evento_nome: string, quantidade: number, site_id = 1) => ({
  site_id,
  site_nome: `Site ${site_id}`,
  grupo_site_nome: null,
  evento_id,
  evento_nome,
  quantidade,
});

describe("montarRanking", () => {
  it("soma os sites de cada tipo e ordena do maior para o menor", () => {
    const ranking = montarRanking([
      linha(2, "LIMPEZA", 100),
      linha(1, "RH", 150, 1),
      linha(1, "RH", 57, 2),
      linha(3, "PORTARIA", 102),
    ]);

    expect(ranking.itens.map((i) => [i.eventoNome, i.quantidade])).toEqual([
      ["RH", 207],
      ["PORTARIA", 102],
      ["LIMPEZA", 100],
    ]);
    expect(ranking.total).toBe(409);
  });

  it("percentual individual, em duas casas, como a linha da referencia (RH 207 de 789 = 26,24)", () => {
    const ranking = montarRanking([linha(1, "RH", 207), linha(2, "OUTROS", 582)]);
    expect(ranking.total).toBe(789);
    expect(ranking.itens[1]).toMatchObject({ eventoNome: "RH", percentual: 26.24 });
  });

  it("empate cai no nome e depois no id, sem depender da ordem do banco", () => {
    const a = montarRanking([linha(2, "Ronda", 3), linha(1, "FROTA", 3), linha(3, "Zeladoria", 3)]);
    const b = montarRanking([linha(3, "Zeladoria", 3), linha(1, "FROTA", 3), linha(2, "Ronda", 3)]);
    expect(a.itens.map((i) => i.eventoNome)).toEqual(["FROTA", "Ronda", "Zeladoria"]);
    expect(b.itens).toEqual(a.itens);
  });

  it("sem linhas, ranking vazio e total zero, sem dividir por zero", () => {
    expect(montarRanking([])).toEqual({ itens: [], total: 0 });
  });
});

describe("paraPlanilha", () => {
  it("posicao, evento, quantidade e percentual com virgula", () => {
    const { colunas, linhas } = paraPlanilha(montarRanking([linha(1, "RH", 1), linha(2, "EPI", 3)]));
    expect(colunas).toEqual(["Posição", "Evento", "Quantidade", "Percentual"]);
    expect(linhas).toEqual([
      ["1", "EPI", "3", "75,00%"],
      ["2", "RH", "1", "25,00%"],
    ]);
  });
});
