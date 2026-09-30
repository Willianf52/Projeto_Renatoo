import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;
type Chamada = { tipo: string; args: unknown[] };
type Linha = { id: number; padrao: boolean } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(() => {
  const resultados = {
    insert: { data: { id: 9, padrao: false } as Linha, error: null as ErroSupabase },
    update: { data: { id: 4, padrao: false } as Linha, error: null as ErroSupabase },
    sincronizarGrupos: { error: null as ErroSupabase },
  };
  const chamadas: Chamada[] = [];
  const registrar = (tipo: string, ...args: unknown[]) => chamadas.push({ tipo, args });

  const createClientMock = vi.fn(async () => ({
    from: () => ({
      insert: (linha: unknown) => {
        registrar("insert", linha);
        return { select: () => ({ maybeSingle: () => Promise.resolve(resultados.insert) }) };
      },
      update: (linha: unknown) => {
        registrar("update", linha);
        return {
          eq: (_coluna: string, id: unknown) => {
            registrar("updateId", id);
            return { select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }) };
          },
        };
      },
    }),
    rpc: (nome: string, params: unknown) => {
      registrar(nome, params);
      return Promise.resolve(resultados.sincronizarGrupos);
    },
  }));

  return {
    createClientMock,
    redirectMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    resultados,
    chamadas,
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarModelo } = await import("./actions");

const LISTAGEM = "/dashboard/checklistlab/modelos";

function formulario(campos: Record<string, string>, grupos: string[] = []) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  for (const grupo of grupos) dados.append("grupos", grupo);
  return dados;
}

const tipos = () => chamadas.map((chamada) => chamada.tipo);
const primeira = (tipo: string) => chamadas.find((chamada) => chamada.tipo === tipo);

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insert = { data: { id: 9, padrao: false }, error: null };
  resultados.update = { data: { id: 4, padrao: false }, error: null };
  resultados.sincronizarGrupos = { error: null };
});

describe("salvarModelo — validação antes do banco", () => {
  it("recusa nome vazio ou só com espaço", async () => {
    for (const nome of ["", "   "]) {
      const estado = await salvarModelo({}, formulario({ nome }));

      expect(estado.erro).toBe("Informe o nome do modelo.");
      expect(chamadas).toHaveLength(0);
    }
  });

  it("recusa grupo que não é id -- o POST pode ser montado à mão", async () => {
    const estado = await salvarModelo({}, formulario({ nome: "Portaria" }, ["3", "abc"]));

    expect(estado.erro).toBe("Grupo inválido.");
    expect(chamadas).toHaveLength(0);
  });

  it("devolve o que a pessoa digitou junto do erro", async () => {
    const estado = await salvarModelo({}, formulario({ nome: "", status: "inativo" }, ["3"]));

    expect(estado.valores).toEqual({ nome: "", ativo: false, grupos: ["3"] });
  });
});

describe("salvarModelo — escrita", () => {
  it("cria o modelo, liga os grupos por RPC atômica e volta para a listagem", async () => {
    await salvarModelo({}, formulario({ nome: "  Portaria  " }, ["3", "7"]));

    expect(tipos()).toEqual(["insert", "sincronizar_grupos_do_modelo"]);
    expect(primeira("insert")?.args[0]).toEqual({ nome: "Portaria", ativo: true });
    expect(primeira("sincronizar_grupos_do_modelo")?.args[0]).toEqual({
      p_modelo_id: 9,
      p_grupos: [3, 7],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(`${LISTAGEM}?salvo=1`);
  });

  it("sincroniza com lista vazia quando nenhum grupo foi marcado -- desliga todos", async () => {
    await salvarModelo({}, formulario({ id: "4", nome: "Portaria" }));

    expect(primeira("sincronizar_grupos_do_modelo")?.args[0]).toEqual({ p_modelo_id: 4, p_grupos: [] });
  });

  it("no modelo padrão, não mexe em grupos", async () => {
    resultados.update = { data: { id: 1, padrao: true }, error: null };

    await salvarModelo({}, formulario({ id: "1", nome: "Padrão" }, ["3"]));

    expect(tipos()).toEqual(["update", "updateId"]);
    expect(redirectMock).toHaveBeenCalled();
  });

  it("traduz nome repetido", async () => {
    resultados.insert = { data: null, error: { code: "23505" } };

    const estado = await salvarModelo({}, formulario({ nome: "Portaria" }));

    expect(estado.erro).toBe("Já existe um modelo com esse nome.");
    expect(tipos()).not.toContain("sincronizar_grupos_do_modelo");
  });

  it("explica a recusa de desligar o padrão", async () => {
    resultados.update = { data: null, error: { code: "23514" } };

    const estado = await salvarModelo({}, formulario({ id: "1", nome: "Padrão", status: "inativo" }));

    expect(estado.erro).toBe("O modelo padrão não pode ser desativado.");
  });

  it("não trata UPDATE de zero linhas como sucesso", async () => {
    resultados.update = { data: null, error: null };

    const estado = await salvarModelo({}, formulario({ id: "4", nome: "Portaria" }));

    expect(estado.erro).toBe("Você não tem permissão para editar este modelo, ou ele não existe mais.");
    expect(tipos()).not.toContain("sincronizar_grupos_do_modelo");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz falha da sincronização de grupos e não redireciona", async () => {
    resultados.sincronizarGrupos = { error: { code: "23503" } };

    const estado = await salvarModelo({}, formulario({ nome: "Portaria" }, ["3"]));

    expect(estado.erro).toBe("Um dos grupos escolhidos não existe mais. Recarregue a página.");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
