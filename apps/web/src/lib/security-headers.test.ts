import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O modulo le NODE_ENV no topo, entao cada cenario precisa de uma importacao
 * limpa: sem resetModules o primeiro import fica em cache e o segundo devolve
 * a CSP do ambiente errado, com o teste passando por engano.
 */
async function carregarHeaders(ambiente: "development" | "production") {
  vi.stubEnv("NODE_ENV", ambiente);
  vi.resetModules();
  const { HEADERS_ESTATICOS } = await import("./security-headers");
  return HEADERS_ESTATICOS;
}

/** Valor injetado por vitest.config.mts em NEXT_PUBLIC_SUPABASE_URL. */
const ORIGEM_DO_PROJETO = "https://example-test.supabase.co";

const diretiva = (csp: string, nome: string) =>
  csp
    .split("; ")
    .find((parte) => parte.startsWith(`${nome} `));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HEADERS_ESTATICOS", () => {
  it("fixa a origem do projeto no connect-src, sem curinga", async () => {
    const headers = await carregarHeaders("production");
    const connectSrc = diretiva(headers["Content-Security-Policy"], "connect-src");

    expect(connectSrc).toContain(ORIGEM_DO_PROJETO);
    expect(connectSrc).toContain("wss://example-test.supabase.co");
    // O curinga autorizaria qualquer projeto Supabase como destino de
    // exfiltracao -- e criar um projeto novo e gratuito.
    expect(connectSrc).not.toContain("*");
  });

  it("nao deixa curinga em nenhuma diretiva", async () => {
    const headers = await carregarHeaders("production");
    expect(headers["Content-Security-Policy"]).not.toContain("*");
  });

  it("mantem as diretivas que contem o estrago de um script hostil", async () => {
    const headers = await carregarHeaders("production");
    const csp = headers["Content-Security-Policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("nao libera unsafe-eval em producao", async () => {
    const headers = await carregarHeaders("production");
    const scriptSrc = diretiva(headers["Content-Security-Policy"], "script-src");

    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("libera unsafe-eval e ws: apenas em desenvolvimento", async () => {
    const headers = await carregarHeaders("development");
    const csp = headers["Content-Security-Policy"];

    // O webpack do `next dev` embrulha cada modulo num eval(); sem isso a
    // pagina renderiza mas nao hidrata.
    expect(diretiva(csp, "script-src")).toContain("unsafe-eval");
    expect(diretiva(csp, "connect-src")).toContain("ws:");
    // Mesmo solto para o Fast Refresh, o destino Supabase segue fixo.
    expect(diretiva(csp, "connect-src")).not.toContain("*");
  });

  it("envia HSTS so em producao", async () => {
    const producao = await carregarHeaders("production");
    expect(producao["Strict-Transport-Security"]).toContain("max-age=63072000");

    // Em dev nao ha HTTPS para o navegador fixar.
    const desenvolvimento = await carregarHeaders("development");
    expect(desenvolvimento["Strict-Transport-Security"]).toBeUndefined();
    expect(desenvolvimento["Content-Security-Policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("mantem os cabecalhos fixos de clickjacking e sniffing", async () => {
    const headers = await carregarHeaders("production");

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
