import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A paginacao do Historico, desde que ela mora no banco (0079): o
 * `historico_de_checklist` e simulado como um banco com `total` checklists que
 * devolve a fatia pedida, e o que se prova aqui e o que o TypeScript pede a
 * ele.
 */
const estado = vi.hoisted(() => {
  const linhaDoBanco = (id: number) => ({
    id,
    numero: id,
    ano: 2026,
    tipo: "CONSULTORIA",
    motivo: null,
    criado_em: "2026-10-28T12:00:00Z",
    modelo_id: 1,
    modelo_nome: "Modelo",
    inicio_em: "2026-10-28T11:50:00Z",
    funcionario_id: null,
    responsavel: null,
    site_id: 1,
    site_nome: "Site",
    caminho: "Site",
    motivo_da_visita: null,
    total_perguntas: 1,
    respondidas: 1,
    nao_conformidades: 0,
    nota: 100,
  });
  return {
    total: 0,
    chamadas: [] as { p_limite: number; p_deslocamento: number }[],
    linhaDoBanco,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (_funcao: string, args: { p_limite: number; p_deslocamento: number }) => {
      estado.chamadas.push({ p_limite: args.p_limite, p_deslocamento: args.p_deslocamento });
      const quantas = Math.max(0, Math.min(args.p_limite, estado.total - args.p_deslocamento));
      const linhas = Array.from({ length: quantas }, (_, i) => estado.linhaDoBanco(args.p_deslocamento + i + 1));
      return { data: { total: estado.total, linhas }, error: null };
    },
  }),
}));

vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { getHistorico, PAGE_SIZE, TETO_DO_HISTORICO } = await import("./queries");

const SEM_FILTROS = {
  campoData: "planejada" as const,
  ordem: "recentes" as const,
  modelos: [],
  sites: [],
  gruposSites: [],
  gruposUsuarios: [],
  responsaveis: [],
};

beforeEach(() => {
  estado.total = 0;
  estado.chamadas = [];
});

describe("getHistorico com pagina", () => {
  it("pede so a pagina ao banco, e o total vem junto", async () => {
    estado.total = 60;

    const historico = await getHistorico(SEM_FILTROS, 2);

    expect(estado.chamadas).toEqual([{ p_limite: PAGE_SIZE, p_deslocamento: PAGE_SIZE }]);
    expect(historico).toMatchObject({ total: 60, pagina: 2, truncado: false });
    expect(historico.linhas.map((l) => l.id)[0]).toBe(PAGE_SIZE + 1);
    expect(historico.linhas).toHaveLength(PAGE_SIZE);
  });

  it("pagina alem do fim volta como a ultima, e diz qual", async () => {
    estado.total = 30;

    const historico = await getHistorico(SEM_FILTROS, 9);

    expect(estado.chamadas).toEqual([
      { p_limite: PAGE_SIZE, p_deslocamento: 8 * PAGE_SIZE },
      { p_limite: PAGE_SIZE, p_deslocamento: PAGE_SIZE },
    ]);
    expect(historico).toMatchObject({ total: 30, pagina: 2 });
    expect(historico.linhas).toHaveLength(5);
  });

  it("filtro vazio fica na pagina 1, sem segunda ida ao banco", async () => {
    const historico = await getHistorico(SEM_FILTROS, 3);

    expect(estado.chamadas).toHaveLength(1);
    expect(historico).toMatchObject({ total: 0, pagina: 1, linhas: [] });
  });
});

describe("getHistorico sem pagina (exportacoes)", () => {
  it("pede tudo ate o teto, e marca truncado quando o filtro passa dele", async () => {
    estado.total = TETO_DO_HISTORICO + 3;

    const historico = await getHistorico(SEM_FILTROS);

    expect(estado.chamadas).toEqual([{ p_limite: TETO_DO_HISTORICO, p_deslocamento: 0 }]);
    expect(historico.truncado).toBe(true);
    expect(historico.linhas).toHaveLength(TETO_DO_HISTORICO);
  });

  it("nem chama o banco quando o filtro nao acha nada no sistema novo", async () => {
    estado.total = 10;

    const historico = await getHistorico({ ...SEM_FILTROS, situacao: "atrasado" });

    expect(estado.chamadas).toEqual([]);
    expect(historico).toEqual({ linhas: [], total: 0, pagina: 1, truncado: false });
  });
});
