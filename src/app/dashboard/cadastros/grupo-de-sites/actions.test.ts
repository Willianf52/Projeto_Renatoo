import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insert: { data: { id: 9 } as { id: number } | null, error: null as ErroSupabase },
      update: { data: null as { id: number } | null, error: null as ErroSupabase },
      updateSites: { error: null as ErroSupabase },
    };
    const chamadas: Array<
      | { tipo: "insert"; tabela: string; linha: Record<string, unknown> }
      | { tipo: "update"; tabela: string; linha: Record<string, unknown> }
      | { tipo: "update-in"; tabela: string; linha: Record<string, unknown>; ids: unknown[] }
    > = [];

    const createClientMock = vi.fn(async () => ({
      from: (tabela: string) => {
        if (tabela === "sites") {
          return {
            update: (linha: Record<string, unknown>) => ({
              in: (_coluna: string, ids: unknown[]) => {
                chamadas.push({ tipo: "update-in", tabela, linha, ids });
                return Promise.resolve(resultados.updateSites);
              },
            }),
          };
        }

        return {
          insert: (linha: Record<string, unknown>) => {
            chamadas.push({ tipo: "insert", tabela, linha });
            return {
              select: () => ({ single: () => Promise.resolve(resultados.insert) }),
            };
          },
          update: (linha: Record<string, unknown>) => {
            chamadas.push({ tipo: "update", tabela, linha });
            return {
              eq: () => ({
                select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }),
              }),
            };
          },
        };
      },
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

function formulario(campos: Record<string, string | string[]>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    if (Array.isArray(valor)) {
      for (const item of valor) dados.append(chave, item);
    } else {
      dados.set(chave, valor);
    }
  }
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insert = { data: { id: 9 }, error: null };
  resultados.update = { data: { id: 1 }, error: null };
  resultados.updateSites = { error: null };
});

describe("salvarGrupoSite", () => {
  it("recusa nome vazio sem chegar ao banco", async () => {
    const estado = await salvarGrupoSite({}, formulario({ nome: "   ", site_ids: "1" }));

    expect(estado.erro).toBe("Informe o nome do grupo.");
    expect(chamadas).toHaveLength(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("recusa sem nenhum site marcado", async () => {
    const estado = await salvarGrupoSite({}, formulario({ nome: "ACE Limpeza" }));

    expect(estado.erro).toBe("Selecione ao menos um site.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa grupo pai igual ao proprio registro em edicao", async () => {
    const estado = await salvarGrupoSite(
      {},
      formulario({ id: "7", nome: "Aversa", grupo_pai_id: "7", site_ids: "1" }),
    );

    expect(estado.erro).toBe("Um grupo não pode ser pai de si mesmo.");
    expect(chamadas).toHaveLength(0);
  });

  it("cria o grupo, normaliza os campos, vincula os sites e volta para a listagem", async () => {
    await salvarGrupoSite(
      {},
      formulario({ nome: "  ACE Limpeza  ", descricao: "  ", site_ids: ["1", "2"] }),
    );

    // Descricao vazia vira null, nao string vazia: a coluna e nullable e a
    // listagem ja traduz null para travessao. Sem "status" no formulario, o
    // default e ativo.
    expect(chamadas[0]).toEqual({
      tipo: "insert",
      tabela: "grupos_sites",
      linha: { nome: "ACE Limpeza", descricao: null, ativo: true, grupo_pai_id: null },
    });
    expect(chamadas[1]).toEqual({
      tipo: "update-in",
      tabela: "sites",
      linha: { grupo_site_id: 9 },
      ids: [1, 2],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it('status "inativo" vira ativo false', async () => {
    await salvarGrupoSite({}, formulario({ nome: "Adibo", status: "inativo", site_ids: "1" }));

    expect(chamadas[0]).toMatchObject({ linha: { ativo: false } });
  });

  it("grava o grupo pai escolhido", async () => {
    await salvarGrupoSite(
      {},
      formulario({ nome: "Filial Norte", grupo_pai_id: "3", site_ids: "1" }),
    );

    expect(chamadas[0]).toMatchObject({ linha: { grupo_pai_id: 3 } });
  });

  it("distingue falta de permissao de falha generica no insert", async () => {
    resultados.insert = { data: null, error: { code: "42501" } };

    const estado = await salvarGrupoSite(
      {},
      formulario({ nome: "Baltic Alphaville", site_ids: "1" }),
    );

    expect(estado.erro).toBe("Você não tem permissão para cadastrar grupos de sites.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz nome duplicado e devolve o que foi digitado", async () => {
    resultados.insert = { data: null, error: { code: "23505" } };

    const estado = await salvarGrupoSite({}, formulario({ nome: "ACE Limpeza", site_ids: "1" }));

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

    const estado = await salvarGrupoSite(
      {},
      formulario({ id: "7", nome: "Aversa", site_ids: "1" }),
    );

    expect(estado.erro).toContain("permissão");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("edita quando o update atinge a linha, vinculando os sites ao id em edicao", async () => {
    const estado = await salvarGrupoSite(
      {},
      formulario({ id: "7", nome: "Aversa", status: "ativo", site_ids: "4" }),
    );

    expect(chamadas[0]).toEqual({
      tipo: "update",
      tabela: "grupos_sites",
      linha: { nome: "Aversa", descricao: null, ativo: true, grupo_pai_id: null },
    });
    expect(chamadas[1]).toEqual({
      tipo: "update-in",
      tabela: "sites",
      linha: { grupo_site_id: 1 },
      ids: [4],
    });
    expect(estado?.erro).toBeUndefined();
    expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
  });

  it("recusa id nao numerico em vez de consultar com NaN", async () => {
    const estado = await salvarGrupoSite(
      {},
      formulario({ id: "abc", nome: "Arumã", site_ids: "1" }),
    );

    expect(estado.erro).toBe("Registro inválido.");
    expect(chamadas).toHaveLength(0);
  });

  it("avisa sem quebrar quando o grupo salva mas o vinculo dos sites falha", async () => {
    resultados.updateSites = { error: { code: "XX000" } };

    const estado = await salvarGrupoSite({}, formulario({ nome: "Vinculo", site_ids: "1" }));

    expect(estado.erro).toContain("não foi possível vincular");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
