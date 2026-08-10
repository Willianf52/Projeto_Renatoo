import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null };
type Chamada = { metodo: string; args: unknown[] };

const { createClientMock, rpcResultado, fromResultado, chamadas } = vi.hoisted(() => {
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  const fromResultado: Resultado = { data: [], error: null };
  const chamadas: Chamada[] = [];

  const createClientMock = vi.fn(async () => ({
    rpc: async () => rpcResultado,
    from() {
      const chain = {
        select: (...args: unknown[]) => {
          chamadas.push({ metodo: "select", args });
          return chain;
        },
        order: (...args: unknown[]) => {
          chamadas.push({ metodo: "order", args });
          return chain;
        },
        range: (...args: unknown[]) => {
          chamadas.push({ metodo: "range", args });
          return chain;
        },
        or: (...args: unknown[]) => {
          chamadas.push({ metodo: "or", args });
          return chain;
        },
        neq: (...args: unknown[]) => {
          chamadas.push({ metodo: "neq", args });
          return chain;
        },
        then: (resolve: (resultado: Resultado) => void) => resolve(fromResultado),
      };
      return chain;
    },
  }));

  return { createClientMock, rpcResultado, fromResultado, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

// `podeAdministrarCadastros` saiu daqui para `lib/permissoes.ts` quando a tela
// de Site / Planta passou a precisar da mesma regra -- os testes dela foram
// junto, para `lib/permissoes.test.ts`.
const { getGruposSitesParaExportar, getGruposSitesParaPai, montarHierarquiaDeSites, LIMITE_EXPORTACAO } =
  await import("./queries");

beforeEach(() => {
  rpcResultado.data = null;
  rpcResultado.error = null;
  fromResultado.data = [];
  fromResultado.error = null;
  chamadas.length = 0;
});

describe("getGruposSitesParaExportar", () => {
  it("sem busca, nao aplica o filtro or()", async () => {
    await getGruposSitesParaExportar(undefined);

    expect(chamadas.some((c) => c.metodo === "or")).toBe(false);
  });

  it("com busca, aplica o mesmo or() de nome/descricao da listagem", async () => {
    await getGruposSitesParaExportar("portaria");

    const or = chamadas.find((c) => c.metodo === "or");
    expect(or?.args[0]).toContain("nome.ilike");
    expect(or?.args[0]).toContain("descricao.ilike");
  });

  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getGruposSitesParaExportar(undefined);

    const range = chamadas.find((c) => c.metodo === "range");
    expect(range?.args).toEqual([0, LIMITE_EXPORTACAO]);
  });

  it("nao truncado quando o resultado cabe no limite", async () => {
    fromResultado.data = [{ id: 1, nome: "A", descricao: null, ativo: true }];

    const { rows, truncado } = await getGruposSitesParaExportar(undefined);

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    fromResultado.data = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) => ({
      id: i,
      nome: `Grupo ${i}`,
      descricao: null,
      ativo: true,
    }));

    const { rows, truncado } = await getGruposSitesParaExportar(undefined);

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});

describe("getGruposSitesParaPai", () => {
  it("sem id em edicao, nao aplica neq()", async () => {
    await getGruposSitesParaPai();

    expect(chamadas.some((c) => c.metodo === "neq")).toBe(false);
  });

  it("com id em edicao, exclui o proprio grupo da lista", async () => {
    await getGruposSitesParaPai(7);

    const neq = chamadas.find((c) => c.metodo === "neq");
    expect(neq?.args).toEqual(["id", 7]);
  });
});

describe("montarHierarquiaDeSites", () => {
  const grupo = 1;

  it("mantem raizes na profundidade 0, sem pai", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 1, nome: "Matriz", site_superior_id: null, grupo_site_id: grupo },
    ]);

    expect(opcoes).toEqual([
      { id: 1, nome: "Matriz", profundidade: 0, paiId: null, grupoSiteId: grupo },
    ]);
  });

  it("poe filho depois do pai, com profundidade maior e paiId marcado", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 2, nome: "Filial", site_superior_id: 1, grupo_site_id: grupo },
      { id: 1, nome: "Matriz", site_superior_id: null, grupo_site_id: grupo },
    ]);

    expect(opcoes.map((o) => o.id)).toEqual([1, 2]);
    expect(opcoes[1]).toMatchObject({ profundidade: 1, paiId: 1 });
  });

  it("trata pai fora da lista como raiz, em vez de sumir com o site", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 2, nome: "Filial", site_superior_id: 999, grupo_site_id: grupo },
    ]);

    expect(opcoes).toEqual([
      { id: 2, nome: "Filial", profundidade: 0, paiId: null, grupoSiteId: grupo },
    ]);
  });

  it("nao entra em loop com ciclo, e nao deixa nenhum site de fora", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 1, nome: "A", site_superior_id: 2, grupo_site_id: grupo },
      { id: 2, nome: "B", site_superior_id: 1, grupo_site_id: grupo },
    ]);

    expect(opcoes).toHaveLength(2);
    expect(opcoes.map((o) => o.id).sort()).toEqual([1, 2]);
  });
});
