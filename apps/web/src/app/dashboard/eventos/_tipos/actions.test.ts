import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data?: unknown; error: { code?: string } | null };

const { chamadas, resultados, redirectMock, revalidatePathMock } = vi.hoisted(() => {
  const chamadas: { tipo: string; tabela: string; args: unknown[] }[] = [];
  const resultados: { insert: Resultado; update: Resultado } = {
    insert: { error: null },
    update: { data: { id: 3 }, error: null },
  };
  return { chamadas, resultados, redirectMock: vi.fn(), revalidatePathMock: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => ({
      insert: async (linha: unknown) => {
        chamadas.push({ tipo: "insert", tabela, args: [linha] });
        return resultados.insert;
      },
      update: (linha: unknown) => ({
        eq: (_coluna: string, id: unknown) => ({
          select: () => ({
            maybeSingle: async () => {
              chamadas.push({ tipo: "update", tabela, args: [linha, id] });
              return resultados.update;
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarTipoDeAnalise, salvarTipoDeClassificacao } = await import("./actions");

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insert = { error: null };
  resultados.update = { data: { id: 3 }, error: null };
});

describe("salvar tipo", () => {
  it("cria tipo de analise com a cor em minusculas e volta para a listagem", async () => {
    await salvarTipoDeAnalise({}, formulario({ nome: "Visita tecnica", cor: "#1A2B3C", status: "ativo" }));

    expect(chamadas[0]).toEqual({
      tipo: "insert",
      tabela: "tipos_de_analise",
      args: [{ nome: "Visita tecnica", cor: "#1a2b3c", ativo: true }],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/eventos/tipos-de-analise");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/eventos/tipos-de-analise?salvo=1");
  });

  it("edita tipo de classificacao na tabela certa, desativando", async () => {
    await salvarTipoDeClassificacao({}, formulario({ id: "3", nome: "Grave", cor: "#ff0000", status: "inativo" }));

    expect(chamadas[0]).toMatchObject({ tipo: "update", tabela: "tipos_de_classificacao", args: [{ ativo: false }, 3] });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/eventos/tipos-de-classificacao?salvo=1");
  });

  it("recusa nome vazio e cor invalida sem chegar ao banco", async () => {
    expect((await salvarTipoDeAnalise({}, formulario({ nome: " ", cor: "#000000" }))).erro).toBe("Informe o nome.");
    expect((await salvarTipoDeAnalise({}, formulario({ nome: "Ok", cor: "azul" }))).erro).toBe("Escolha uma cor válida.");
    expect(chamadas).toHaveLength(0);
  });

  it("traduz nome repetido e falta de permissao", async () => {
    resultados.insert = { error: { code: "23505" } };
    expect((await salvarTipoDeAnalise({}, formulario({ nome: "Dup", cor: "#000000" }))).erro).toBe(
      "Já existe um tipo com esse nome.",
    );

    resultados.insert = { error: { code: "42501" } };
    expect((await salvarTipoDeAnalise({}, formulario({ nome: "X", cor: "#000000" }))).erro).toContain("Somente o Gestor");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("trata UPDATE barrado pelo RLS (zero linhas) como recusa, e nao como sucesso", async () => {
    resultados.update = { data: null, error: null };

    const estado = await salvarTipoDeAnalise({}, formulario({ id: "3", nome: "X", cor: "#000000" }));

    expect(estado.erro).toContain("não tem permissão");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
