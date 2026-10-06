import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  anexo: null as { caminho: string; nome: string } | null,
  arquivo: new Blob(["conteudo"], { type: "text/html" }) as Blob | null,
}));

vi.mock("../../queries", () => ({ getAnexo: async () => estado.anexo }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    storage: {
      from: () => ({
        download: async () => (estado.arquivo ? { data: estado.arquivo, error: null } : { data: null, error: { message: "x" } }),
      }),
    },
  }),
}));

const { GET } = await import("./route");

const chamar = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) });
const UUID = "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e";

beforeEach(() => {
  estado.anexo = { caminho: `7/${UUID}-laudo.pdf`, nome: "Laudo Final.pdf" };
  estado.arquivo = new Blob(["conteudo"], { type: "text/html" });
});

describe("GET /anexos/[id]", () => {
  it("o tipo vem da extensao, nunca do objeto: um HTML gravado como .pdf sai como PDF, em download", async () => {
    const resposta = await chamar("3");

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toBe("application/pdf");
    expect(resposta.headers.get("Content-Disposition")).toBe("attachment; filename*=UTF-8''Laudo%20Final.pdf");
    expect(resposta.headers.get("Cache-Control")).toBe("private, max-age=60");
  });

  it("imagem aparece na aba", async () => {
    estado.anexo = { caminho: `7/${UUID}-foto.jpg`, nome: "foto.jpg" };
    const resposta = await chamar("3");

    expect(resposta.headers.get("Content-Type")).toBe("image/jpeg");
    expect(resposta.headers.get("Content-Disposition")).toMatch(/^inline;/);
  });

  it("anexo que nao existe, id torto, extensao fora da lista e falha no Storage respondem a mesma coisa", async () => {
    estado.anexo = null;
    expect((await chamar("3")).status).toBe(404);
    expect((await chamar("abc")).status).toBe(404);

    estado.anexo = { caminho: `7/${UUID}-pagina.html`, nome: "pagina.html" };
    expect((await chamar("3")).status).toBe(404);

    estado.anexo = { caminho: `7/${UUID}-laudo.pdf`, nome: "laudo.pdf" };
    estado.arquivo = null;
    const resposta = await chamar("3");
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toBe("Não encontrado");
  });
});
