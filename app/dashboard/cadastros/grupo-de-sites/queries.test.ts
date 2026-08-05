import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, rpcResultado } = vi.hoisted(() => {
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  const createClientMock = vi.fn(async () => ({
    rpc: async () => rpcResultado,
  }));

  return { createClientMock, rpcResultado };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { podeAdministrarCadastros } = await import("./queries");

beforeEach(() => {
  rpcResultado.data = null;
  rpcResultado.error = null;
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
