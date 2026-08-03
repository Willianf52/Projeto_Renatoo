import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("retorna o fallback padrao quando o valor e ausente", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("usa o fallback customizado quando informado", () => {
    expect(safeRedirectPath(null, "/login")).toBe("/login");
    expect(safeRedirectPath(undefined, "/login")).toBe("/login");
  });

  it("aceita um caminho interno absoluto", () => {
    expect(safeRedirectPath("/dashboard/inspecoes/coletas-importadas")).toBe(
      "/dashboard/inspecoes/coletas-importadas",
    );
  });

  it("preserva query string e fragmento de um caminho interno", () => {
    expect(safeRedirectPath("/dashboard?erro=acesso-indisponivel")).toBe(
      "/dashboard?erro=acesso-indisponivel",
    );
  });

  it("rejeita caminho relativo sem barra inicial", () => {
    expect(safeRedirectPath("dashboard")).toBe("/dashboard");
  });

  it("rejeita URL absoluta para outro host", () => {
    expect(safeRedirectPath("https://site-falso.com")).toBe("/dashboard");
    expect(safeRedirectPath("http://site-falso.com/phishing")).toBe("/dashboard");
  });

  it("rejeita caminho protocol-relative (//host)", () => {
    expect(safeRedirectPath("//site-falso.com")).toBe("/dashboard");
  });

  it("rejeita disfarce com barra invertida (/\\host)", () => {
    expect(safeRedirectPath("/\\site-falso.com")).toBe("/dashboard");
  });

  it("rejeita qualquer caminho que contenha barra invertida", () => {
    expect(safeRedirectPath("/dashboard\\..\\admin")).toBe("/dashboard");
  });

  it("rejeita esquemas nao-http, como javascript:", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });
});
