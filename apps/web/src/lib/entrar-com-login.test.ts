import { describe, expect, it } from "vitest";
import { emailDoLogin, normalizarLogin, padraoDoLogin } from "./entrar-com-login";

const PERFIS = [
  { email: "operacional00@empresa.test", login: "Rodrigo.operacional00" },
  { email: "silmara@empresa.test", login: " silmara.esteves.up " },
  { email: "outro@empresa.test", login: null },
];

describe("normalizarLogin", () => {
  it("compara sem caixa e sem espaco nas pontas", () => {
    expect(normalizarLogin("  Rodrigo.OPERACIONAL00 ")).toBe("rodrigo.operacional00");
  });
});

describe("padraoDoLogin", () => {
  it("escapa o _ e a barra do LIKE", () => {
    expect(padraoDoLogin(" jusseli_22 ")).toBe("jusseli\\_22");
    expect(padraoDoLogin("a\\b")).toBe("a\\\\b");
  });

  it("recusa curinga do PostgREST e vazio", () => {
    expect(padraoDoLogin("*")).toBeNull();
    expect(padraoDoLogin("ro%")).toBeNull();
    expect(padraoDoLogin("   ")).toBeNull();
  });
});

describe("emailDoLogin", () => {
  it("acha o e-mail pelo login, sem diferenciar maiuscula", () => {
    expect(emailDoLogin(PERFIS, "rodrigo.operacional00")).toBe("operacional00@empresa.test");
    expect(emailDoLogin(PERFIS, "SILMARA.esteves.up")).toBe("silmara@empresa.test");
  });

  it("login desconhecido ou vazio nao acha nada", () => {
    expect(emailDoLogin(PERFIS, "ninguem")).toBeNull();
    expect(emailDoLogin(PERFIS, "  ")).toBeNull();
  });

  it("login repetido em dois cadastros nao entra em nenhum", () => {
    const repetido = [...PERFIS, { email: "copia@empresa.test", login: "rodrigo.OPERACIONAL00" }];
    expect(emailDoLogin(repetido, "rodrigo.operacional00")).toBeNull();
  });

  it("perfil sem e-mail nao vira entrada", () => {
    expect(emailDoLogin([{ email: null, login: "sem.email" }], "sem.email")).toBeNull();
  });
});
