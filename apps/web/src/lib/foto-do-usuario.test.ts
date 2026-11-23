import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { caminhoDaFoto, problemaDaFoto } = await import("./foto-do-usuario");

describe("foto do usuario", () => {
  it("guarda uma foto por pessoa, na pasta dela", () => {
    expect(caminhoDaFoto("abc")).toBe("abc/foto");
  });

  it("aceita JPG, PNG e WebP ate 2 MB", () => {
    expect(problemaDaFoto({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(problemaDaFoto({ size: 1000, type: "image/webp" })).toBeNull();
  });

  it("recusa vazio, outro tipo e acima de 2 MB", () => {
    expect(problemaDaFoto(null)).toBe("Escolha uma foto.");
    expect(problemaDaFoto({ size: 0, type: "image/png" })).toBe("Escolha uma foto.");
    expect(problemaDaFoto({ size: 1000, type: "application/pdf" })).toBe("A foto precisa ser JPG, PNG ou WebP.");
    expect(problemaDaFoto({ size: 3 * 1024 * 1024, type: "image/png" })).toBe("A foto deve ter no máximo 2 MB.");
  });
});
