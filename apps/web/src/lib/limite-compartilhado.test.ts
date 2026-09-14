import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O contador em si (atomicidade, janela, recusa) e provado no Postgres, por
 * `limite_de_taxa_compartilhado_test.sql`. O que fica aqui e o que so existe no
 * TypeScript: a traducao do numero devolvido, o hash da chave e -- o mais
 * importante -- que toda falha cai na contingencia por instancia, e nunca em
 * "liberado" nem em excecao subindo para a rota.
 */

const { createAdminClientMock, rpcMock, erroMock } = vi.hoisted(() => {
  const rpcMock = vi.fn();
  const erroMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));
  return { createAdminClientMock, rpcMock, erroMock };
});

// Ver `midia.test.ts` para por que `server-only` e mockado por arquivo, e nao
// no config da suite.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));
vi.mock("@/lib/log", () => ({ erro: erroMock }));

const { hashDaChave, limitarTaxa, reiniciarAvisosParaTeste } = await import("./limite-compartilhado");

let sequencia = 0;
/** Chave nova por caso: a contingencia usa o `Map` real de rate-limit.ts, que
 * sobrevive entre os testes do arquivo. */
const chaveNova = () => `teste:${++sequencia}`;

describe("limitarTaxa (compartilhado)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    erroMock.mockReset();
    createAdminClientMock.mockReset();
    createAdminClientMock.mockImplementation(() => ({ rpc: rpcMock }));
    reiniciarAvisosParaTeste();
  });

  it("0 do banco e permitido", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });

    await expect(limitarTaxa(chaveNova(), 10, 60_000)).resolves.toEqual({ permitido: true });
  });

  it("N > 0 do banco e recusa, com N como Retry-After", async () => {
    rpcMock.mockResolvedValue({ data: 42, error: null });

    await expect(limitarTaxa(chaveNova(), 10, 60_000)).resolves.toEqual({
      permitido: false,
      tenteNovamenteEmSegundos: 42,
    });
  });

  it("manda o sha256 da chave, nunca o IP em claro", async () => {
    rpcMock.mockResolvedValue({ data: 0, error: null });

    await limitarTaxa("importar-coletas:203.0.113.9", 20, 60_000);

    expect(rpcMock).toHaveBeenCalledWith("consumir_limite_de_taxa", {
      p_chave: hashDaChave("importar-coletas:203.0.113.9"),
      p_limite: 20,
      p_janela_ms: 60_000,
    });
    const enviado = rpcMock.mock.calls[0][1].p_chave as string;
    expect(enviado).toMatch(/^[0-9a-f]{64}$/);
    expect(enviado).not.toContain("203.0.113.9");
  });

  it("sem service_role, cai no contador por instancia -- e ele ainda limita", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY");
    });
    const chave = chaveNova();

    await expect(limitarTaxa(chave, 1, 60_000)).resolves.toEqual({ permitido: true });
    const segunda = await limitarTaxa(chave, 1, 60_000);

    expect(segunda.permitido).toBe(false);
    expect(erroMock).toHaveBeenCalledTimes(1);
  });

  it("erro da rpc cai na contingencia em vez de liberar", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    const chave = chaveNova();

    await limitarTaxa(chave, 1, 60_000);
    const segunda = await limitarTaxa(chave, 1, 60_000);

    expect(segunda.permitido).toBe(false);
  });

  it("resposta sem erro e sem numero nao vira 'permitido' por omissao", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const chave = chaveNova();

    await limitarTaxa(chave, 1, 60_000);
    const segunda = await limitarTaxa(chave, 1, 60_000);

    expect(segunda.permitido).toBe(false);
  });

  it("excecao de rede nao sobe para a rota", async () => {
    rpcMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(limitarTaxa(chaveNova(), 10, 60_000)).resolves.toEqual({ permitido: true });
  });

  it("com o banco fora, avisa uma vez por minuto, nao uma vez por requisicao", async () => {
    rpcMock.mockRejectedValue(new TypeError("fetch failed"));

    for (let i = 0; i < 5; i++) await limitarTaxa(chaveNova(), 10, 60_000);

    expect(erroMock).toHaveBeenCalledTimes(1);
  });
});
