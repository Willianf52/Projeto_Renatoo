// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { guardarEmailLembrado, lerEmailLembrado } from "./email-lembrado";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("email lembrado", () => {
  it("sem nada guardado, devolve vazio", () => {
    expect(lerEmailLembrado()).toBe("");
  });

  it("guarda so o e-mail, aparado e em minusculas", () => {
    guardarEmailLembrado("  Fulano@Empresa.com ");
    expect(localStorage.getItem("login-email-lembrado")).toBe("fulano@empresa.com");
    expect(lerEmailLembrado()).toBe("fulano@empresa.com");
    expect(localStorage.length).toBe(1);
  });

  it("vazio apaga o que estava guardado", () => {
    guardarEmailLembrado("a@b.com");
    guardarEmailLembrado("");
    expect(localStorage.getItem("login-email-lembrado")).toBeNull();
  });

  it("storage indisponivel nao propaga erro", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => guardarEmailLembrado("a@b.com")).not.toThrow();
    expect(lerEmailLembrado()).toBe("");
  });
});
