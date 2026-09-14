import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type CookieParaGravar = { name: string; value: string; options?: Record<string, unknown> };

const { getUserMock, signOutMock, maybeSingleMock, createServerClientMock, renovarCookies } =
  vi.hoisted(() => {
    const getUserMock = vi.fn();
    const signOutMock = vi.fn();
    const maybeSingleMock = vi.fn();

    /**
     * Guarda o adaptador de cookies que updateSession entrega ao createServerClient.
     * E por ele que o supabase-js devolve o par de tokens renovado, e o teste
     * precisa poder disparar isso no meio de getUser() -- como acontece de verdade.
     */
    let adaptador: {
      setAll: (cookies: CookieParaGravar[], cabecalhos?: Record<string, string>) => void;
    } | null = null;

    const createServerClientMock = vi.fn(
      (_url: string, _key: string, options: { cookies: { setAll: (c: never[]) => void } }) => {
        adaptador = options.cookies as unknown as typeof adaptador;
        return {
          auth: { getUser: getUserMock, signOut: signOutMock },
          from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
          }),
        };
      },
    );

    /**
     * O `cabecalhos` e o segundo argumento que o `@supabase/ssr` passa junto
     * com os cookies -- `no-store` e companhia. Opcional aqui so para os
     * testes que nao se importam com ele continuarem chamando com um argumento.
     */
    const renovarCookies = (
      cookies: CookieParaGravar[],
      cabecalhos?: Record<string, string>,
    ) => adaptador?.setAll(cookies, cabecalhos);

    return { getUserMock, signOutMock, maybeSingleMock, createServerClientMock, renovarCookies };
  });

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

const { updateSession } = await import("./middleware");

function buildRequest(path: string, opts: { cookie?: string } = {}) {
  return new NextRequest(new URL(path, "https://app.test"), {
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  });
}

function redirectLocation(response: Awaited<ReturnType<typeof updateSession>>) {
  const location = response.headers.get("location");
  return location ? new URL(location) : null;
}

const USUARIO = { id: "user-1" };

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sem sessao, rota publica: passa direto sem redirecionar", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(buildRequest("/"));

    expect(redirectLocation(response)).toBeNull();
  });

  it("sem sessao, rota protegida: redireciona para / preservando o destino em redirectTo", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(
      buildRequest("/dashboard/inspecoes/coletas-importadas"),
    );

    const location = redirectLocation(response);
    expect(location?.pathname).toBe("/");
    expect(location?.searchParams.get("redirectTo")).toBe(
      "/dashboard/inspecoes/coletas-importadas",
    );
  });

  it("usuario ativo acessando /: redireciona para /dashboard", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: { ativo: true }, error: null });

    const response = await updateSession(buildRequest("/"));

    const location = redirectLocation(response);
    expect(location?.pathname).toBe("/dashboard");
  });

  it("usuario ativo acessando /: leva para o redirect os cookies renovados por getUser()", async () => {
    // getUser() renova o token e devolve o par novo pelo adaptador de cookies.
    // Um redirect criado do zero nasce sem eles: o servidor consumiu o refresh
    // token antigo e o navegador nunca receberia o novo -- sessao caindo sozinha.
    getUserMock.mockImplementation(async () => {
      renovarCookies([{ name: "sb-access-token", value: "token-renovado", options: {} }]);
      return { data: { user: USUARIO } };
    });
    maybeSingleMock.mockResolvedValue({ data: { ativo: true }, error: null });

    const response = await updateSession(
      buildRequest("/", { cookie: "sb-access-token=token-antigo" }),
    );

    expect(redirectLocation(response)?.pathname).toBe("/dashboard");
    expect(response.cookies.get("sb-access-token")?.value).toBe("token-renovado");
  });

  it("resposta que grava cookie de sessao carrega os cabecalhos de nao-cachear", async () => {
    // O `@supabase/ssr` passa esses cabecalhos junto com os cookies porque uma
    // resposta com Set-Cookie de sessao NAO pode ser guardada por CDN ou proxy:
    // guardada, ela e servida a outra pessoa, e o token de sessao vai junto.
    // O adaptador recebia so o primeiro argumento e descartava estes em silencio.
    const CABECALHOS = {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
    };

    getUserMock.mockImplementation(async () => {
      renovarCookies(
        [{ name: "sb-access-token", value: "token-renovado", options: {} }],
        CABECALHOS,
      );
      return { data: { user: USUARIO } };
    });
    maybeSingleMock.mockResolvedValue({ data: { ativo: true }, error: null });

    const response = await updateSession(
      buildRequest("/dashboard", { cookie: "sb-access-token=token-antigo" }),
    );

    expect(response.headers.get("cache-control")).toBe(CABECALHOS["Cache-Control"]);
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("redirect que leva a sessao renovada tambem carrega os cabecalhos de nao-cachear", async () => {
    // O redirect e criado depois do setAll, entao nasce sem cabecalho nenhum:
    // sem `preservarSessao` propagar, o caso mais comum (entrar em "/" ja
    // logado) seria justamente o que escaparia.
    getUserMock.mockImplementation(async () => {
      renovarCookies([{ name: "sb-access-token", value: "token-renovado", options: {} }], {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      });
      return { data: { user: USUARIO } };
    });
    maybeSingleMock.mockResolvedValue({ data: { ativo: true }, error: null });

    const response = await updateSession(
      buildRequest("/", { cookie: "sb-access-token=token-antigo" }),
    );

    expect(redirectLocation(response)?.pathname).toBe("/dashboard");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("usuario ativo em rota protegida: nao redireciona", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: { ativo: true }, error: null });

    const response = await updateSession(
      buildRequest("/dashboard/inspecoes/coletas-importadas"),
    );

    expect(redirectLocation(response)).toBeNull();
  });

  it("perfil desativado: encerra a sessao, limpa cookies sb- e redireciona com erro=acesso-indisponivel", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: { ativo: false }, error: null });

    const response = await updateSession(
      buildRequest("/dashboard", { cookie: "sb-access-token=abc; outro-cookie=mantido" }),
    );

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });

    const location = redirectLocation(response);
    expect(location?.pathname).toBe("/");
    expect(location?.searchParams.get("erro")).toBe("acesso-indisponivel");

    expect(response.cookies.get("sb-access-token")?.value).toBe("");
  });

  it("usuario autenticado sem linha em profiles: bloqueia com erro=perfil-ausente", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const response = await updateSession(buildRequest("/dashboard"));

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(redirectLocation(response)?.searchParams.get("erro")).toBe("perfil-ausente");
  });

  it("falha ao consultar o perfil: bloqueia por padrao (fail-closed), nao libera acesso", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "conexao recusada" } });

    const response = await updateSession(buildRequest("/dashboard"));

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(redirectLocation(response)?.searchParams.get("erro")).toBe("perfil-ausente");
  });

  it("evita loop de redirecionamento: se ja esta em / com o mesmo erro sinalizado, so limpa cookies", async () => {
    getUserMock.mockResolvedValue({ data: { user: USUARIO } });
    maybeSingleMock.mockResolvedValue({ data: { ativo: false }, error: null });

    const response = await updateSession(
      buildRequest("/?erro=acesso-indisponivel", { cookie: "sb-access-token=abc" }),
    );

    expect(redirectLocation(response)).toBeNull();
    expect(response.cookies.get("sb-access-token")?.value).toBe("");
  });
});
