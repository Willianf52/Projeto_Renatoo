import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, signOutMock, maybeSingleMock, createServerClientMock } = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const signOutMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const createServerClientMock = vi.fn(() => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  }));

  return { getUserMock, signOutMock, maybeSingleMock, createServerClientMock };
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
