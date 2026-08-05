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

  /**
   * O parser de URL remove tab, LF e CR antes de resolver o endereco. Sem essa
   * cobertura, "/\t/site-falso.com" passava nas checagens de texto e so virava
   * "//site-falso.com" -- destino externo -- na hora de navegar.
   */
  it("rejeita disfarce com caractere de controle removido pelo parser", () => {
    expect(safeRedirectPath("/\t/site-falso.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\n/site-falso.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\r/site-falso.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\t\t//site-falso.com")).toBe("/dashboard");
  });

  it("aceita caminho interno cujo control char nao muda o destino", () => {
    // O tab e removido, mas sobra "/dashboard" -- continua interno.
    expect(safeRedirectPath("/dash\tboard")).toBe("/dash\tboard");
  });

  it("mantem percent-encoding intacto, sem normalizar", () => {
    // %09 codificado nao e removido pelo parser: vira segmento de caminho
    // comum, no proprio dominio, e deve chegar ao destino como veio.
    expect(safeRedirectPath("/dashboard/%09/relatorio")).toBe("/dashboard/%09/relatorio");
  });
});
