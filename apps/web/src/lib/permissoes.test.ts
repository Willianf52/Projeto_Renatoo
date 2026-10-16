import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, rpcResultado, chamadasDeRpc } = vi.hoisted(() => {
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  const chamadasDeRpc: string[] = [];

  const createClientMock = vi.fn(async () => ({
    rpc: async (nome: string) => {
      chamadasDeRpc.push(nome);
      return rpcResultado;
    },
  }));

  return { createClientMock, rpcResultado, chamadasDeRpc };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { podeAdministrarCadastros, podeEditarChecklist } = await import("./permissoes");

beforeEach(() => {
  rpcResultado.data = null;
  rpcResultado.error = null;
  chamadasDeRpc.length = 0;
  // A funcao loga a falha por `lib/log.ts`; silenciar mantem a saida do teste
  // legivel sem esconder o comportamento sob teste, que e o retorno.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("podeAdministrarCadastros", () => {
  /**
   * A funcao chama `pode_administrar_cadastros()` (migration 0009) via RPC e
   * so repassa o booleano -- a regra de quem administra mora no banco, nao
   * duplicada aqui em TS.
   */
  it("repassa o resultado do RPC", async () => {
    rpcResultado.data = true;

    expect(await podeAdministrarCadastros()).toBe(true);
  });

  it("chama a funcao do banco, e nao reimplementa a regra", async () => {
    await podeAdministrarCadastros();

    expect(chamadasDeRpc).toEqual(["pode_administrar_cadastros"]);
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

  it("nega quando o RPC devolve null", async () => {
    // `null` chega aqui se a funcao do banco for removida ou trocar de
    // assinatura. Coerca para false, nao para "indefinido logo liberado".
    rpcResultado.data = null;

    expect(await podeAdministrarCadastros()).toBe(false);
  });
});

describe("podeEditarChecklist", () => {
  /**
   * O editor de checklist e so do GESTOR (0073), e nao da regua de cadastros:
   * se alguem trocar a funcao chamada, o SUPERVISOR e o OPERACIONAL voltam a
   * ver os botoes, e so o banco os barraria.
   */
  it("consulta a regra do GESTOR, e nao a de cadastros", async () => {
    rpcResultado.data = true;

    expect(await podeEditarChecklist()).toBe(true);
    expect(chamadasDeRpc).toEqual(["pode_administrar_usuarios"]);
  });

  it("nega quando o banco nao autoriza", async () => {
    rpcResultado.data = false;

    expect(await podeEditarChecklist()).toBe(false);
  });
});
