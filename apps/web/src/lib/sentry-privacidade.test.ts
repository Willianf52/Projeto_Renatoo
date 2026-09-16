import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trava o achado H1 (auditoria de AppSec de 16/09/2026): as tres
 * inicializacoes do Sentry precisam declarar, campo a campo, que nada de
 * corpo, cookie ou dado de usuario sai. O caso que este teste existe para
 * pegar e `dataCollection: {}` -- que parece inofensivo e, no SDK, liga tudo.
 */

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: initMock,
  captureRouterTransitionStart: vi.fn(),
}));

const { CABECALHOS_SENSIVEIS, removerDadosDaRequisicao } = await import("./sentry-privacidade");

type Opcoes = {
  sendDefaultPii?: boolean;
  dataCollection?: Record<string, unknown>;
  beforeSend?: (evento: { request?: Record<string, unknown> }) => unknown;
};

async function opcoesDe(carregar: () => Promise<unknown>): Promise<Opcoes> {
  initMock.mockClear();
  vi.resetModules();
  await carregar();
  expect(initMock).toHaveBeenCalledTimes(1);
  return initMock.mock.calls[0][0] as Opcoes;
}

const inicializacoes: Array<[string, () => Promise<unknown>]> = [
  ["servidor", () => import("../../sentry.server.config")],
  ["edge", () => import("../../sentry.edge.config")],
  ["navegador", () => import("../instrumentation-client")],
];

beforeEach(() => {
  initMock.mockReset();
});

describe.each(inicializacoes)("Sentry.init do %s", (_nome, carregar) => {
  it("nao coleta corpo, cookie, usuario nem consulta ao banco", async () => {
    const opcoes = await opcoesDe(carregar);

    expect(opcoes.sendDefaultPii).toBe(false);
    expect(opcoes.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    });
  });

  it("nega os cabecalhos que carregam credencial", async () => {
    const opcoes = await opcoesDe(carregar);
    const cabecalhos = opcoes.dataCollection?.httpHeaders as { request: { deny: string[] }; response: unknown };

    expect(cabecalhos.response).toBe(false);
    for (const nome of ["authorization", "cookie", "x-webhook-secret", "x-importacao-secret"]) {
      expect(cabecalhos.request.deny).toContain(nome);
    }
  });

  it("tem o beforeSend que remove o corpo como segunda barreira", async () => {
    const opcoes = await opcoesDe(carregar);

    // Comportamento, nao identidade: `vi.resetModules()` carrega outra
    // instancia do modulo a cada inicializacao.
    const evento = { request: { url: "/api/senha/verificar-vazamento", data: { senha: "Segredo@123" } } };
    expect(opcoes.beforeSend?.(evento)).toEqual({ request: { url: "/api/senha/verificar-vazamento" } });
  });
});

describe("removerDadosDaRequisicao", () => {
  it("apaga corpo e cookies e preserva o resto do evento", () => {
    const evento = {
      message: "falha",
      request: { url: "/api/senha/verificar-vazamento", data: { senha: "Segredo@123" }, cookies: { sb: "x" } },
    };

    const resultado = removerDadosDaRequisicao(evento);

    expect(resultado.request).toEqual({ url: "/api/senha/verificar-vazamento" });
    expect(resultado.message).toBe("falha");
  });

  it("evento sem request passa intacto", () => {
    const evento: { message: string; request?: { data?: unknown } } = { message: "sem requisicao" };

    expect(removerDadosDaRequisicao(evento)).toEqual({ message: "sem requisicao" });
  });

  it("a lista de cabecalhos negados nao tem duplicata nem maiuscula", () => {
    expect(new Set(CABECALHOS_SENSIVEIS).size).toBe(CABECALHOS_SENSIVEIS.length);
    expect(CABECALHOS_SENSIVEIS.every((nome) => nome === nome.toLowerCase())).toBe(true);
  });
});
