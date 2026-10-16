import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { agrupar, extrairFiltros, seriesPorClassificacao, seriesPorUsuario } = await import("./queries");

const grave = { nome: "Grave", cor: "#ff0000" };
const leve = { nome: "Leve", cor: null };

describe("agrupar", () => {
  const resultado = agrupar([
    // Reclassificada: vale o andamento mais recente (id maior).
    {
      autor: { nome_completo: "Ana" },
      ocorrencia_andamentos: [
        { id: 1, classificacao_id: 2, tipos_de_classificacao: leve },
        { id: 5, classificacao_id: 1, tipos_de_classificacao: grave },
        { id: 7, classificacao_id: null, tipos_de_classificacao: null },
      ],
    },
    { autor: { nome_completo: "Ana" }, ocorrencia_andamentos: [{ id: 2, classificacao_id: 2, tipos_de_classificacao: leve }] },
    { autor: { nome_completo: "Bia" }, ocorrencia_andamentos: [{ id: 3, classificacao_id: 2, tipos_de_classificacao: leve }] },
    // Nunca classificada: fica de fora, como na referencia.
    { autor: { nome_completo: "Bia" }, ocorrencia_andamentos: [{ id: 4, classificacao_id: null, tipos_de_classificacao: null }] },
    { autor: { nome_completo: "Caio" }, ocorrencia_andamentos: [] },
  ]);

  it("conta cada ocorrencia pela classificacao mais recente e ignora as nao classificadas", () => {
    expect(resultado.total).toBe(3);
    expect(resultado.classificacoes.map((c) => [c.nome, c.quantidade])).toEqual([
      ["Grave", 1],
      ["Leve", 2],
    ]);
  });

  it("usa a cor do tipo e, sem cor cadastrada, a da paleta", () => {
    expect(resultado.classificacoes[0].cor).toBe("#ff0000");
    expect(resultado.classificacoes[1].cor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("ordena usuarios pelo total e empilha por classificacao", () => {
    expect(resultado.usuarios.map((u) => [u.nome, u.total])).toEqual([
      ["Ana", 2],
      ["Bia", 1],
    ]);
    expect(seriesPorUsuario(resultado)).toEqual([
      { nome: "Grave", cor: "#ff0000", valores: [1, 0] },
      { nome: "Leve", cor: resultado.classificacoes[1].cor, valores: [1, 1] },
    ]);
  });

  it("no grafico por classificacao, cada serie so ocupa a propria coluna", () => {
    expect(seriesPorClassificacao(resultado).map((s) => s.valores)).toEqual([
      [1, 0],
      [0, 2],
    ]);
  });
});

describe("classificacao do Registrar Evento (0072)", () => {
  it("vale quando nenhuma analise classificou; a analise, quando houver, manda", () => {
    const r = agrupar([
      { autor: { nome_completo: "Ana" }, classificacao_id: 2, tipos_de_classificacao: leve, ocorrencia_andamentos: [] },
      {
        autor: { nome_completo: "Ana" },
        classificacao_id: 2,
        tipos_de_classificacao: leve,
        ocorrencia_andamentos: [{ id: 9, classificacao_id: 1, tipos_de_classificacao: grave }],
      },
    ]);
    expect(r.classificacoes.map((c) => [c.nome, c.quantidade])).toEqual([
      ["Grave", 1],
      ["Leve", 1],
    ]);
  });
});

describe("extrairFiltros", () => {
  it("aceita so status conhecido", () => {
    expect(extrairFiltros({ status: "EM_ANALISE" }).status).toBe("EM_ANALISE");
    expect(extrairFiltros({ status: "x" }).status).toBeUndefined();
  });
});
