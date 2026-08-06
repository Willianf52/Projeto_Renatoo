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
        then: (resolve: (resultado: Resultado) => void) => resolve(fromResultado),
      };
      return chain;
    },
  }));

  return { createClientMock, rpcResultado, fromResultado, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { podeAdministrarCadastros, getGruposSitesParaExportar, LIMITE_EXPORTACAO } =
  await import("./queries");

beforeEach(() => {
  rpcResultado.data = null;
  rpcResultado.error = null;
  fromResultado.data = [];
  fromResultado.error = null;
  chamadas.length = 0;
});

describe("podeAdministrarCadastros", () => {
  /**
   * A funcao chama `pode_administrar_cadastros()` (migration 0009) via RPC e
   * so repassa o booleano -- a regra de quem administra mora no banco, nao
   * mais duplicada aqui em TS.
   */
  it("repassa o resultado do RPC", async () => {
    rpcResultado.data = true;

    expect(await podeAdministrarCadastros()).toBe(true);
  });

  it("nega quando o RPC nao autoriza", async () => {
    rpcResultado.data = false;

    expect(await podeAdministrarCadastros()).toBe(false);
  });

  /**
   * Falha de leitura nao deve virar acesso liberado: uma queda de rede na
   * chamada do RPC teria que negar por padrao, nao autorizar por engano.
   */
  it("nega por padrao quando o RPC falha, em vez de liberar", async () => {
    rpcResultado.error = { message: "conexão perdida" };

    expect(await podeAdministrarCadastros()).toBe(false);
  });
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
