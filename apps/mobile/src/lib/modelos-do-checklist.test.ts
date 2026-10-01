import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De onde vem o checklist de uma consultoria (0061). O Supabase entra como
 * duble que devolve, por tabela, o que o teste mandar -- o que se prova e o
 * caminho ate o modelo (site direto ou pela visita) e o que acontece quando
 * uma das leituras falha.
 */
type Resposta = { data: unknown; error: { message: string } | null };

const { respostas, filtros } = vi.hoisted(() => ({
  respostas: {} as Record<string, Resposta>,
  /** `[tabela, coluna, valor]` de cada `.eq()`, para conferir o recorte. */
  filtros: [] as [string, string, unknown][],
}));

vi.mock("./supabase", () => {
  function construtor(tabela: string) {
    const resposta = () => Promise.resolve(respostas[tabela] ?? { data: null, error: null });
    const builder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => {
        filtros.push([tabela, coluna, valor]);
        return builder;
      },
      order: () => builder,
      maybeSingle: resposta,
      then: (resolver: (valor: Resposta) => unknown, rejeitar: (motivo: unknown) => unknown) =>
        resposta().then(resolver, rejeitar),
    };
    return builder;
  }

  return { supabase: { from: construtor } };
});

const { lerModelosDoSite, lerPerguntasDoModelo } = await import("./modelos-do-checklist");

const PADRAO = { id: 1, nome: "Padrão", padrao: true, ativo: true };
const GERAL = { id: 2, nome: "Geral", padrao: false, ativo: true };
const LIMPEZA = { id: 3, nome: "Limpeza", padrao: false, ativo: true };

beforeEach(() => {
  for (const chave of Object.keys(respostas)) delete respostas[chave];
  filtros.length = 0;
  respostas.modelos_checklist = { data: [PADRAO, GERAL, LIMPEZA], error: null };
  respostas.modelos_checklist_grupos = {
    data: [
      { modelo_id: 2, grupo_site_id: 10 },
      { modelo_id: 3, grupo_site_id: 10 },
      { modelo_id: 2, grupo_site_id: 20 },
    ],
    error: null,
  };
});

describe("lerModelosDoSite", () => {
  it("pelo site (\"Ver sites\"), devolve os modelos do grupo dele", async () => {
    respostas.sites = { data: { grupo_site_id: 10 }, error: null };

    expect(await lerModelosDoSite({ visitaId: null, siteId: 5 })).toEqual({ ok: true, modelos: [GERAL, LIMPEZA] });
    expect(filtros).toContainEqual(["sites", "id", 5]);
  });

  it("pela visita, chega ao grupo pelo site da visita", async () => {
    respostas.visitas = { data: { sites: { grupo_site_id: 20 } }, error: null };

    expect(await lerModelosDoSite({ visitaId: 81, siteId: null })).toEqual({ ok: true, modelos: [GERAL] });
    expect(filtros).toContainEqual(["visitas", "id", 81]);
  });

  it("grupo sem modelo cai no padrao", async () => {
    respostas.sites = { data: { grupo_site_id: 99 }, error: null };

    expect(await lerModelosDoSite({ visitaId: null, siteId: 5 })).toEqual({ ok: true, modelos: [PADRAO] });
  });

  it("site que nao voltou (RLS, apagado) e erro, e nao o padrao", async () => {
    respostas.sites = { data: null, error: null };

    expect(await lerModelosDoSite({ visitaId: null, siteId: 5 })).toEqual({
      ok: false,
      erro: "Não foi possível carregar o checklist deste site.",
    });
  });

  it("falha na leitura dos modelos e erro", async () => {
    respostas.sites = { data: { grupo_site_id: 10 }, error: null };
    respostas.modelos_checklist = { data: null, error: { message: "rede" } };

    expect((await lerModelosDoSite({ visitaId: null, siteId: 5 })).ok).toBe(false);
  });

  it("sem nem o padrao na resposta e erro -- o padrao existe sempre", async () => {
    respostas.sites = { data: { grupo_site_id: 99 }, error: null };
    respostas.modelos_checklist = { data: [GERAL], error: null };

    expect((await lerModelosDoSite({ visitaId: null, siteId: 5 })).ok).toBe(false);
  });
});

describe("lerPerguntasDoModelo", () => {
  it("recorta pelo modelo e so as ativas, com o tipo de resposta", async () => {
    respostas.perguntas_checklist = {
      data: [
        { id: 11, ordem: 1, texto: "Extintores?", tipo_resposta: "CNA" },
        { id: 12, ordem: 2, texto: "Dúvidas com o RH?", tipo_resposta: "SN" },
      ],
      error: null,
    };

    const resultado = await lerPerguntasDoModelo(3);

    expect(resultado.erro).toBeNull();
    expect(resultado.perguntas.map((p) => p.tipoResposta)).toEqual(["CNA", "SN"]);
    expect(filtros).toContainEqual(["perguntas_checklist", "modelo_id", 3]);
    expect(filtros).toContainEqual(["perguntas_checklist", "ativo", true]);
  });

  it("traduz o erro do PostgREST", async () => {
    respostas.perguntas_checklist = { data: null, error: { message: "x" } };

    expect(await lerPerguntasDoModelo(3)).toEqual({
      perguntas: [],
      erro: "Não foi possível carregar as perguntas do checklist.",
    });
  });
});
