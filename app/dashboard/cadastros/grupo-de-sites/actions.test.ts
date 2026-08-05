import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insert: { error: null as ErroSupabase },
      update: { data: null as { id: number } | null, error: null as ErroSupabase },
    };
    const chamadas: Array<{ tipo: "insert" | "update"; linha: Record<string, unknown> }> = [];

    const createClientMock = vi.fn(async () => ({
      from: () => ({
        insert: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "insert", linha });
          return Promise.resolve(resultados.insert);
        },
        update: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "update", linha });
          return {
            eq: () => ({
              select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }),
            }),
          };
        },
      }),
    }));

    return {
      createClientMock,
      redirectMock: vi.fn(),
      revalidatePathMock: vi.fn(),
      resultados,
      chamadas,
    };
  },
);

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarGrupoSite } = await import("./actions");

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

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

describe("salvarGrupoSite", () => {
  it("recusa nome vazio sem chegar ao banco", async () => {
    const estado = await salvarGrupoSite({}, formulario({ nome: "   " }));

    expect(estado.erro).toBe("Informe o nome do grupo.");
    expect(chamadas).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("cria o grupo, normaliza os campos e volta para a listagem", async () => {
    await salvarGrupoSite({}, formulario({ nome: "  ACE Limpeza  ", descricao: "  " }));

    // Descricao vazia vira null, nao string vazia: a coluna e nullable e a
    // listagem ja traduz null para travessao.
    expect(chamadas).toEqual([
      { tipo: "insert", linha: { nome: "ACE Limpeza", descricao: null, ativo: false } },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it("checkbox marcado vira ativo true", async () => {
    await salvarGrupoSite({}, formulario({ nome: "Adibo", ativo: "on" }));

    expect(chamadas[0].linha).toMatchObject({ ativo: true });
  });

  it("distingue falta de permissao de falha generica no insert", async () => {
    resultados.insert = { error: { code: "42501" } };

    const estado = await salvarGrupoSite({}, formulario({ nome: "Baltic Alphaville" }));

    expect(estado.erro).toBe("Você não tem permissão para cadastrar grupos de sites.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz nome duplicado e devolve o que foi digitado", async () => {
    resultados.insert = { error: { code: "23505" } };

    const estado = await salvarGrupoSite({}, formulario({ nome: "ACE Limpeza" }));

    expect(estado.erro).toBe("Já existe um grupo de sites com esse nome.");
    expect(estado.valores?.nome).toBe("ACE Limpeza");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  /**
   * O caso silencioso: UPDATE barrado pelo RLS nao devolve erro, devolve zero
   * linhas. Sem esta checagem a tela diria que salvou e voltaria para a
   * listagem com o registro intacto.
   */
  it("avisa quando o update nao altera linha nenhuma", async () => {
    resultados.update = { data: null, error: null };

    const estado = await salvarGrupoSite({}, formulario({ id: "7", nome: "Aversa" }));

    expect(estado.erro).toContain("permissão");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("edita quando o update atinge a linha", async () => {
    const estado = await salvarGrupoSite({}, formulario({ id: "7", nome: "Aversa", ativo: "on" }));

    expect(chamadas).toEqual([
      { tipo: "update", linha: { nome: "Aversa", descricao: null, ativo: true } },
    ]);
    expect(estado?.erro).toBeUndefined();
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it("recusa id nao numerico em vez de consultar com NaN", async () => {
    const estado = await salvarGrupoSite({}, formulario({ id: "abc", nome: "Arumã" }));

    expect(estado.erro).toBe("Registro inválido.");
    expect(chamadas).toHaveLength(0);
  });
});
