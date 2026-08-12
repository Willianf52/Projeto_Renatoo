import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;
type Chamada = { tipo: string; args: unknown[] };

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insertGrupo: { data: { id: 9 } as { id: number } | null, error: null as ErroSupabase },
      updateGrupo: { data: { id: 4 } as { id: number } | null, error: null as ErroSupabase },
      apagarMembros: { error: null as ErroSupabase },
      inserirMembros: { error: null as ErroSupabase },
      excluirGrupo: { data: { id: 4 } as { id: number } | null, error: null as ErroSupabase },
    };
    const chamadas: Chamada[] = [];
    const registrar = (tipo: string, ...args: unknown[]) => chamadas.push({ tipo, args });

    const createClientMock = vi.fn(async () => ({
      // A tabela importa: `grupos_usuarios` e `grupos_usuarios_membros` passam
      // pelo mesmo `from`.
      from: (tabela: string) => ({
        insert: (linha: unknown) => {
          if (tabela === "grupos_usuarios_membros") {
            registrar("inserirMembros", linha);
            return Promise.resolve(resultados.inserirMembros);
          }
          registrar("insertGrupo", linha);
          return {
            select: () => ({ maybeSingle: () => Promise.resolve(resultados.insertGrupo) }),
          };
        },
        update: (linha: unknown) => {
          registrar("updateGrupo", linha);
          return {
            eq: () => ({
              select: () => ({ maybeSingle: () => Promise.resolve(resultados.updateGrupo) }),
            }),
          };
        },
        delete: () => ({
          // Duas formas atras do mesmo `delete().eq()`: a limpeza de membros e
          // aguardada direto, e a exclusao do grupo encadeia `.select()` para
          // detectar recusa do RLS (zero linhas).
          eq: (coluna: string, valor: unknown) => {
            if (tabela === "grupos_usuarios") {
              registrar("excluirGrupo", tabela, coluna, valor);
              return {
                select: () => ({ maybeSingle: () => Promise.resolve(resultados.excluirGrupo) }),
              };
            }
            registrar("apagarMembros", tabela, coluna, valor);
            return Promise.resolve(resultados.apagarMembros);
          },
        }),
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

const { salvarGrupoUsuarios, excluirGrupoUsuarios } = await import("./actions");

const LISTAGEM = "/dashboard/cadastros/grupo-de-usuarios";
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function formulario(campos: Record<string, string>, membros: string[] = []) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  for (const membro of membros) dados.append("membros", membro);
  return dados;
}

const tipos = () => chamadas.map((c) => c.tipo);
const primeira = (tipo: string) => chamadas.find((c) => c.tipo === tipo);

beforeEach(() => {
  vi.clearAllMocks();
  chamadas.length = 0;
  resultados.insertGrupo = { data: { id: 9 }, error: null };
  resultados.updateGrupo = { data: { id: 4 }, error: null };
  resultados.apagarMembros = { error: null };
  resultados.inserirMembros = { error: null };
  resultados.excluirGrupo = { data: { id: 4 }, error: null };
});

describe("exclusão", () => {
  it("apaga o grupo e revalida a listagem", async () => {
    const estado = await excluirGrupoUsuarios({}, formulario({ id: "4" }));

    expect(estado.erro).toBeUndefined();
    expect(primeira("excluirGrupo")?.args).toEqual(["grupos_usuarios", "id", 4]);
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
  });

  /** O cascade da 0003 leva os vinculos junto; apagar `grupos_usuarios_membros`
   * aqui seria um round-trip a mais para repetir o que o banco ja faz. */
  it("não apaga os membros por fora: quem faz isso é o cascade", async () => {
    await excluirGrupoUsuarios({}, formulario({ id: "4" }));

    expect(tipos()).not.toContain("apagarMembros");
  });

  it("recusa id que não é inteiro sem chegar ao banco", async () => {
    const estado = await excluirGrupoUsuarios({}, formulario({ id: "4x" }));

    expect(estado.erro).toBe("Registro inválido.");
    expect(chamadas).toHaveLength(0);
  });

  /**
   * O caso que justifica o `.select()` na action: DELETE barrado pelo RLS nao
   * devolve erro, devolve zero linhas. Sem isto a tela diria que apagou.
   */
  it("trata zero linhas como recusa, e não como sucesso", async () => {
    resultados.excluirGrupo = { data: null, error: null };

    const estado = await excluirGrupoUsuarios({}, formulario({ id: "4" }));

    expect(estado.erro).toContain("não tem permissão");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("traduz o erro de permissão do banco", async () => {
    resultados.excluirGrupo = { data: null, error: { code: "42501" } };

    const estado = await excluirGrupoUsuarios({}, formulario({ id: "4" }));

    expect(estado.erro).toBe("Você não tem permissão para administrar grupos de usuários.");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("validação", () => {
  it("recusa nome vazio sem chegar ao banco", async () => {
    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "  " }));

    expect(estado.erro).toBe("Informe o nome do grupo.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa membro que não é uuid", async () => {
    // Os checkboxes da tela nao sao garantia: o POST pode ser montado a mao, e
    // o valor vai para uma FK uuid.
    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "Ronda" }, ["nao-e-uuid"]));

    expect(estado.erro).toBe("Membro inválido.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa membro repetido", async () => {
    // Violaria a PK (grupo_id, profile_id) e voltaria como erro de duplicata,
    // que nao significa nada para quem esta usando a tela.
    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "Ronda" }, [UUID_A, UUID_A]));

    expect(estado.erro).toBe("Há membros repetidos na seleção.");
    expect(chamadas).toHaveLength(0);
  });

  it("devolve o que a pessoa digitou junto do erro", async () => {
    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "", descricao: "Turno A" }));

    expect(estado.valores?.descricao).toBe("Turno A");
  });
});

describe("criação", () => {
  it("cria o grupo, vincula os membros e volta para a listagem", async () => {
    await salvarGrupoUsuarios({}, formulario({ nome: "Ronda", descricao: "Turno A" }, [UUID_A]));

    expect(primeira("insertGrupo")?.args[0]).toEqual({ nome: "Ronda", descricao: "Turno A" });
    // O id vem do `.select()` pos-insert: sem ele seria uma segunda consulta
    // buscando o grupo pelo nome.
    expect(primeira("inserirMembros")?.args[0]).toEqual([{ grupo_id: 9, profile_id: UUID_A }]);
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(`${LISTAGEM}?salvo=1`);
  });

  it("converte descrição vazia em null, e não em string vazia", async () => {
    await salvarGrupoUsuarios({}, formulario({ nome: "Ronda", descricao: "  " }));

    expect(primeira("insertGrupo")?.args[0]).toEqual({ nome: "Ronda", descricao: null });
  });

  it("aceita grupo sem membro, sem inserir linha vazia", async () => {
    await salvarGrupoUsuarios({}, formulario({ nome: "Ronda" }));

    expect(tipos()).not.toContain("inserirMembros");
    expect(redirectMock).toHaveBeenCalledWith(`${LISTAGEM}?salvo=1`);
  });

  /**
   * INSERT barrado pelo RLS devolve erro, mas um `select` pos-insert que a
   * policy de leitura recuse voltaria vazio -- e prosseguir dali gravaria
   * membros num grupo que nao da para confirmar que existe.
   */
  it("para quando o insert volta sem linha", async () => {
    resultados.insertGrupo = { data: null, error: null };

    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "Ronda" }, [UUID_A]));

    expect(estado.erro).toContain("não tem permissão");
    expect(tipos()).not.toContain("inserirMembros");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz nome duplicado", async () => {
    resultados.insertGrupo = { data: null, error: { code: "23505" } };

    const estado = await salvarGrupoUsuarios({}, formulario({ nome: "Ronda" }));

    expect(estado.erro).toBe("Já existe um grupo de usuários com esse nome.");
  });
});

describe("edição", () => {
  it("atualiza o grupo quando o id vem no formulário", async () => {
    await salvarGrupoUsuarios({}, formulario({ id: "4", nome: "Ronda" }, [UUID_B]));

    expect(tipos()).toEqual(["updateGrupo", "apagarMembros", "inserirMembros"]);
    expect(primeira("inserirMembros")?.args[0]).toEqual([{ grupo_id: 4, profile_id: UUID_B }]);
  });

  /**
   * Apagar e recriar, em vez de calcular a diferenca: a tabela e so a chave
   * primaria -- nao ha coluna para preservar entre um estado e outro -- e o
   * diff exigiria ler os vinculos atuais, um round-trip a mais para chegar no
   * mesmo lugar.
   */
  it("apaga os vínculos atuais antes de recriar, para desmarcar ter efeito", async () => {
    await salvarGrupoUsuarios({}, formulario({ id: "4", nome: "Ronda" }));

    expect(primeira("apagarMembros")?.args).toEqual([
      "grupos_usuarios_membros",
      "grupo_id",
      4,
    ]);
    // Sem nenhum marcado, o resultado e o grupo ficar sem membros.
    expect(tipos()).not.toContain("inserirMembros");
  });

  it("recusa id que não é inteiro", async () => {
    const estado = await salvarGrupoUsuarios({}, formulario({ id: "abc", nome: "Ronda" }));

    expect(estado.erro).toBe("Registro inválido.");
    expect(chamadas).toHaveLength(0);
  });

  /**
   * UPDATE barrado pelo RLS nao devolve erro, devolve zero linhas alteradas.
   * Sem conferir isso, quem nao tem permissao veria sucesso -- e, pior aqui,
   * os membros seriam apagados em seguida.
   */
  it("não toca nos membros quando o update não alterou linha nenhuma", async () => {
    resultados.updateGrupo = { data: null, error: null };

    const estado = await salvarGrupoUsuarios({}, formulario({ id: "4", nome: "Ronda" }, [UUID_A]));

    expect(estado.erro).toContain("não tem permissão para editar este grupo");
    expect(tipos()).not.toContain("apagarMembros");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("não redireciona quando a gravação dos membros falha", async () => {
    resultados.inserirMembros = { error: { code: "42501" } };

    const estado = await salvarGrupoUsuarios({}, formulario({ id: "4", nome: "Ronda" }, [UUID_A]));

    expect(estado.erro).toContain("não tem permissão");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
