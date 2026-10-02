import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Lembrar meu e-mail": o que se prova aqui e que so o e-mail e guardado,
 * normalizado, que desmarcar apaga, e que Keystore quebrado nao derruba o
 * login -- o mesmo contrato de `limite-guardado.ts`.
 */
const { armazem, falhas } = vi.hoisted(() => ({
  armazem: new Map<string, string>(),
  falhas: { ler: false, gravar: false },
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "afterFirstUnlock",
  getItemAsync: async (chave: string) => {
    if (falhas.ler) throw new Error("Keystore indisponivel");
    return armazem.has(chave) ? armazem.get(chave)! : null;
  },
  setItemAsync: async (chave: string, valor: string) => {
    if (falhas.gravar) throw new Error("Keystore indisponivel");
    armazem.set(chave, valor);
  },
  deleteItemAsync: async (chave: string) => {
    if (falhas.gravar) throw new Error("Keystore indisponivel");
    armazem.delete(chave);
  },
}));

const { lerEmailLembrado, guardarEmailLembrado } = await import("./email-lembrado");

const CHAVE = "login-email-lembrado";

beforeEach(() => {
  armazem.clear();
  falhas.ler = false;
  falhas.gravar = false;
});

describe("email lembrado", () => {
  it("sem nada guardado, devolve null", async () => {
    expect(await lerEmailLembrado()).toBeNull();
  });

  it("guarda o e-mail aparado e em minusculas", async () => {
    await guardarEmailLembrado("  Inspetor@Empresa.com ");
    expect(armazem.get(CHAVE)).toBe("inspetor@empresa.com");
    expect(await lerEmailLembrado()).toBe("inspetor@empresa.com");
  });

  it("null ou vazio apaga o que estava guardado", async () => {
    armazem.set(CHAVE, "a@b.com");
    await guardarEmailLembrado(null);
    expect(armazem.has(CHAVE)).toBe(false);

    armazem.set(CHAVE, "a@b.com");
    await guardarEmailLembrado("   ");
    expect(armazem.has(CHAVE)).toBe(false);
  });

  it("Keystore indisponivel nao propaga erro", async () => {
    falhas.ler = true;
    falhas.gravar = true;
    await expect(guardarEmailLembrado("a@b.com")).resolves.toBeUndefined();
    await expect(lerEmailLembrado()).resolves.toBeNull();
  });
});
