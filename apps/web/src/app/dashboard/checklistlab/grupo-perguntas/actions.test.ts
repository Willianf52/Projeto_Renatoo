import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data?: unknown; error: { code?: string } | null };

const { chamadas, resultados, redirectMock } = vi.hoisted(() => ({
  chamadas: [] as { tipo: string; tabela: string; args: unknown[] }[],
  resultados: { insert: { error: null } as Resultado, update: { data: { id: 1 }, error: null } as Resultado },
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => ({
      insert: async (linha: unknown) => {
        chamadas.push({ tipo: "insert", tabela, args: [linha] });
        return resultados.insert;
      },
      update: (linha: unknown) => ({
        eq: (_c: string, id: unknown) => ({
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarGrupo } = await import("./actions");

function formulario(campos: Record<string, string>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insert = { error: null };
  resultados.update = { data: { id: 1 }, error: null };
});

describe("salvarGrupo", () => {
  it("cria com cor em minusculas e ordem numerica", async () => {
    await salvarGrupo({}, formulario({ nome: "ACE Limpeza", cor: "#C681F8", ordem: "10", status: "ativo" }));

    expect(chamadas[0]).toEqual({
      tipo: "insert",
      tabela: "grupos_perguntas",
      args: [{ nome: "ACE Limpeza", cor: "#c681f8", ordem: 10, ativo: true }],
    });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/checklistlab/grupo-perguntas?salvo=1");
  });

  it("edita e desativa", async () => {
    await salvarGrupo({}, formulario({ id: "3", nome: "Sicredis", cor: "#29aea2", ordem: "1", status: "inativo" }));
    expect(chamadas[0]).toMatchObject({ tipo: "update", args: [{ ativo: false }, 3] });
  });

  it("recusa nome vazio, cor invalida e ordem fora da faixa sem chegar ao banco", async () => {
    expect((await salvarGrupo({}, formulario({ nome: "", cor: "#000000", ordem: "1" }))).erro).toBe("Informe o nome do grupo.");
    expect((await salvarGrupo({}, formulario({ nome: "X", cor: "roxo", ordem: "1" }))).erro).toBe("Escolha uma cor válida.");
    expect((await salvarGrupo({}, formulario({ nome: "X", cor: "#000000", ordem: "10000" }))).erro).toBe(
      "A ordem deve ser no máximo 9999.",
    );
    expect(chamadas).toHaveLength(0);
  });

  it("traduz nome repetido e o UPDATE barrado pelo RLS", async () => {
    resultados.insert = { error: { code: "23505" } };
    expect((await salvarGrupo({}, formulario({ nome: "X", cor: "#000000", ordem: "1" }))).erro).toBe(
      "Já existe um grupo de perguntas com esse nome.",
    );
    resultados.update = { data: null, error: null };
    expect((await salvarGrupo({}, formulario({ id: "3", nome: "X", cor: "#000000", ordem: "1" }))).erro).toContain(
      "não tem permissão",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
