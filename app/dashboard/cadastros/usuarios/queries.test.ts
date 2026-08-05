import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null; count: number };
type Ordem = { coluna: string; ascending?: boolean };

/** Encadeamento minimo do query builder do Supabase; o objeto e "thenable",
 * entao `await query` resolve o resultado. */
type Chain = {
  select: () => Chain;
  eq: () => Chain;
  ilike: () => Chain;
  range: () => Chain;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Chain;
  then: (resolve: (resultado: Resultado) => void) => void;
};

const { createClientMock, ordens, rpcResultado } = vi.hoisted(() => {
  const ordens: Ordem[] = [];
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  const createClientMock = vi.fn(async () => ({
    from() {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        range: () => chain,
        order: (coluna, opcoes) => {
          ordens.push({ coluna, ascending: opcoes?.ascending });
          return chain;
        },
        then: (resolve) => resolve({ data: [], error: null, count: 0 }),
      };
      return chain;
    },
    rpc: async () => rpcResultado,
  }));

  return { createClientMock, ordens, rpcResultado };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { getUsuarios, montarSelectDeUsuarios, podeVerTodaOperacao } = await import("./queries");

beforeEach(() => {
  ordens.length = 0;
  rpcResultado.data = null;
  rpcResultado.error = null;
});

describe("montarSelectDeUsuarios", () => {
  it("sem filtro de grupo, nao embute a tabela de membros", () => {
    const select = montarSelectDeUsuarios(false);

    expect(select).not.toContain("grupos_usuarios_membros");
    expect(select).toContain("superior:profiles!superior_id");
  });

  it("com filtro de grupo, embute os membros como inner para filtrar no banco", () => {
    const select = montarSelectDeUsuarios(true);

    expect(select).toContain("grupos_usuarios_membros!inner ( grupo_id )");
  });
});

describe("getUsuarios", () => {
  /**
   * `nome_completo` e nullable e sem unique (migrations 0001/0003): homonimos
   * e perfis sem nome empatam, e sem desempate a ordem entre eles muda a cada
   * consulta -- ou seja, a cada troca de pagina.
   */
  it("desempata a ordenacao por id", async () => {
    await getUsuarios({ pagina: 1 });

    expect(ordens).toEqual([
      { coluna: "nome_completo", ascending: true },
      { coluna: "id", ascending: true },
    ]);
  });
});

describe("podeVerTodaOperacao", () => {
  it("repassa o resultado do RPC", async () => {
    rpcResultado.data = true;

    expect(await podeVerTodaOperacao()).toBe(true);
  });

  it("nega por padrao quando o RPC falha, em vez de liberar", async () => {
    rpcResultado.error = { message: "conexão perdida" };

    expect(await podeVerTodaOperacao()).toBe(false);
  });
});
