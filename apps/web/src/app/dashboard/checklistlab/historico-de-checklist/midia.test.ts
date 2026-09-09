import { beforeEach, describe, expect, it, vi } from "vitest";
import { responderComMidia } from "./midia";

/**
 * O que estes casos guardam nao e o caminho feliz -- e a regra da 0046
 * traduzida para esta rota: o `contentType` de um objeto do bucket vem do
 * cliente que gravou, entao servi-lo de volta como veio deixaria um HTML
 * gravado por fora do app rodar NO ORIGIN DO PAINEL, com a sessao do gestor
 * junto. Sem teste, essa e a linha que alguem "simplifica" seis meses depois.
 */
const { createClientMock, download, erroMock } = vi.hoisted(() => {
  const download = vi.fn();
  const erroMock = vi.fn();
  const createClientMock = vi.fn(async () => ({
    storage: { from: () => ({ download }) },
  }));
  return { createClientMock, download, erroMock };
});

/**
 * `server-only` levanta excecao ao ser importado fora de um Server Component,
 * e o vitest roda em node puro -- sem isto o arquivo inteiro falha na
 * importacao, antes do primeiro caso.
 *
 * Mockado aqui, e nao removido de `midia.ts`: aquele import e o que quebra o
 * BUILD se um Client Component um dia importar o modulo, e trocar uma barreira
 * de compilacao por um teste que passa seria o pior lado da troca. Tambem nao
 * virou alias no `vitest.config.mts` de proposito -- neutralizar a barreira
 * para a suite inteira esconderia o mesmo erro nos outros cinco modulos
 * `server-only` do projeto, entre eles o `supabase/admin.ts`, que carrega a
 * service_role.
 */
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/log", () => ({ erro: erroMock, gerarIdDeRequisicao: () => "teste" }));

const CAMINHO = "42/assinatura-abc.png";

function imagem(tipo: string) {
  return { data: new Blob([new Uint8Array([1, 2, 3])], { type: tipo }), error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("responderComMidia", () => {
  it("devolve 404 sem caminho, e nem chega a falar com o Storage", async () => {
    const resposta = await responderComMidia(null);

    expect(resposta.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o Storage recusa -- mesma resposta de caminho ausente", async () => {
    // Recusa do RLS e objeto inexistente precisam ser indistinguiveis: a
    // diferenca transformaria a rota num oraculo de "existe foto aqui".
    download.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const resposta = await responderComMidia(CAMINHO);

    expect(resposta.status).toBe(404);
    expect(await responderComMidia(null).then((r) => r.status)).toBe(resposta.status);
  });

  it("recusa tipo fora do allowlist da 0046 sem devolver o conteudo", async () => {
    download.mockResolvedValue(imagem("text/html"));

    const resposta = await responderComMidia(CAMINHO);

    expect(resposta.status).toBe(404);
    expect(resposta.headers.get("Content-Type")).not.toContain("text/html");
    // Registrado: objeto fora do allowlist significa gravacao por fora do app
    // de campo, que e o cenario que a 0046 descreve.
    expect(erroMock).toHaveBeenCalledOnce();
  });

  it("recusa tambem o objeto sem tipo nenhum", async () => {
    download.mockResolvedValue(imagem(""));

    expect((await responderComMidia(CAMINHO)).status).toBe(404);
  });

  it("entrega png e jpeg com o tipo do allowlist, nao o que veio do objeto", async () => {
    for (const tipo of ["image/png", "image/jpeg"]) {
      download.mockResolvedValue(imagem(tipo));

      const resposta = await responderComMidia(CAMINHO);

      expect(resposta.status).toBe(200);
      expect(resposta.headers.get("Content-Type")).toBe(tipo);
      expect(resposta.headers.get("Content-Disposition")).toBe("inline");
      // `private`: e dado pessoal, nao pode ficar em cache compartilhado.
      expect(resposta.headers.get("Cache-Control")).toContain("private");
      expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    }
  });
});
