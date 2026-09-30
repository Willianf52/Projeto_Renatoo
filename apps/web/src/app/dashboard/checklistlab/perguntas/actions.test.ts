import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insert: { error: null as ErroSupabase },
      update: { data: { id: 1 } as { id: number } | null, error: null as ErroSupabase },
    };
    const chamadas: Array<
      | { tipo: "insert"; tabela: string; linha: Record<string, unknown> }
      | { tipo: "update"; tabela: string; linha: Record<string, unknown>; id: unknown }
    > = [];

    const createClientMock = vi.fn(async () => ({
      from: (tabela: string) => ({
        insert: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "insert", tabela, linha });
          return Promise.resolve(resultados.insert);
        },
        update: (linha: Record<string, unknown>) => ({
          eq: (_coluna: string, id: unknown) => {
            chamadas.push({ tipo: "update", tabela, linha, id });
            return {
              select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }),
            };
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

const { salvarPergunta } = await import("./actions");

const LISTAGEM = "/dashboard/checklistlab/perguntas";

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

describe("salvarPergunta — validação antes do banco", () => {
  it("recusa texto vazio ou só com espaço", async () => {
    for (const texto of ["", "   "]) {
      const estado = await salvarPergunta({}, formulario({ texto, ordem: "1" }));

      expect(estado.erro).toBe("Informe o texto da pergunta.");
      expect(chamadas).toHaveLength(0);
      expect(redirectMock).not.toHaveBeenCalled();
    }
  });

  it("recusa ordem ausente, não numérica ou fracionada", async () => {
    // `Number("")` é 0 e `Number("abc")` é NaN -- os dois precisam cair na
    // mesma recusa legível, e não num insert com `ordem: NaN`.
    for (const ordem of ["", "abc", "1.5"]) {
      const estado = await salvarPergunta({}, formulario({ texto: "Extintores?", ordem }));

      expect(estado.erro).toBeTruthy();
      expect(chamadas).toHaveLength(0);
    }
  });

  it("recusa ordem zero ou negativa", async () => {
    for (const ordem of ["0", "-3"]) {
      const estado = await salvarPergunta({}, formulario({ texto: "Extintores?", ordem }));

      expect(estado.erro).toBe("A ordem deve ser maior que zero.");
      expect(chamadas).toHaveLength(0);
    }
  });

  it("recusa texto acima do limite de aplicação", async () => {
    const estado = await salvarPergunta(
      {},
      formulario({ texto: "x".repeat(301), ordem: "1" }),
    );

    expect(estado.erro).toBe("A pergunta deve ter no máximo 300 caracteres.");
    expect(chamadas).toHaveLength(0);
  });

  it("recusa id não inteiro sem chegar ao banco", async () => {
    const estado = await salvarPergunta({}, formulario({ id: "abc", texto: "Ok?", ordem: "1" }));

    expect(estado.erro).toBe("Registro inválido.");
    expect(chamadas).toHaveLength(0);
  });

  it("devolve o que a pessoa digitou junto do erro", async () => {
    const estado = await salvarPergunta({}, formulario({ texto: "", ordem: "7" }));

    // Sem isto o formulário voltaria em branco e a pessoa redigitaria tudo.
    expect(estado.valores).toEqual({ texto: "", ordem: "7", ativo: true, modelo: "", tipoResposta: "CNA" });
  });
});

describe("salvarPergunta — escrita", () => {
  it("cria a pergunta no modelo, apara o texto e volta para a listagem do modelo", async () => {
    await salvarPergunta(
      {},
      formulario({ texto: "  Extintores no prazo?  ", ordem: "3", modelo: "5", tipo_resposta: "CN" }),
    );

    // Sem "status" no formulário, o default é ativa -- é o lado seguro para um
    // cadastro novo.
    expect(chamadas[0]).toEqual({
      tipo: "insert",
      tabela: "perguntas_checklist",
      linha: { texto: "Extintores no prazo?", ordem: 3, ativo: true, modelo_id: 5, tipo_resposta: "CN" },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
    expect(redirectMock).toHaveBeenCalledWith(`${LISTAGEM}?salvo=1&modelo=5`);
  });

  it("recusa cadastro sem modelo antes do banco", async () => {
    for (const modelo of ["", "abc", "0"]) {
      const estado = await salvarPergunta({}, formulario({ texto: "Extintores?", ordem: "1", modelo }));

      expect(estado.erro).toBe("Escolha o modelo da pergunta.");
      expect(chamadas).toHaveLength(0);
    }
  });

  it("tipo de resposta fora da lista vira CNA -- o tipo de toda pergunta antiga", async () => {
    await salvarPergunta({}, formulario({ texto: "Ok?", ordem: "1", modelo: "5", tipo_resposta: "XYZ" }));

    expect(chamadas[0]).toMatchObject({ linha: { tipo_resposta: "CNA" } });
  });

  it("grava ativo = false quando o status é inativo", async () => {
    await salvarPergunta({}, formulario({ texto: "Antiga", ordem: "9", modelo: "5", status: "inativo" }));

    expect(chamadas[0]).toMatchObject({ linha: { ativo: false } });
  });

  it("traduz ordem duplicada em vez de mostrar o erro cru do Postgres", async () => {
    resultados.insert = { error: { code: "23505" } };

    const estado = await salvarPergunta({}, formulario({ texto: "Extintores?", ordem: "1", modelo: "5" }));

    expect(estado.erro).toBe("Já existe uma pergunta nessa ordem neste modelo. Escolha outro número.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("traduz recusa do RLS no insert", async () => {
    resultados.insert = { error: { code: "42501" } };

    const estado = await salvarPergunta({}, formulario({ texto: "Extintores?", ordem: "1", modelo: "5" }));

    expect(estado.erro).toBe("Você não tem permissão para cadastrar perguntas do checklist.");
  });

  it("edita pela id sem mandar modelo nem tipo -- ficam fora do grant de UPDATE (0061)", async () => {
    await salvarPergunta(
      {},
      formulario({ id: "4", texto: "Novo texto", ordem: "2", modelo: "5", tipo_resposta: "SN" }),
    );

    expect(chamadas[0]).toEqual({
      tipo: "update",
      tabela: "perguntas_checklist",
      linha: { texto: "Novo texto", ordem: 2, ativo: true },
      id: 4,
    });
    expect(redirectMock).toHaveBeenCalledWith(`${LISTAGEM}?salvo=1&modelo=5`);
  });

  it("não trata UPDATE de zero linhas como sucesso", async () => {
    // O caso que `verificarEscritaComRls` existe para pegar: o RLS barra o
    // UPDATE sem devolver erro -- devolve zero linhas. Sem a checagem, a tela
    // diria "salvo" e redirecionaria com o registro intacto.
    resultados.update = { data: null, error: null };

    const estado = await salvarPergunta({}, formulario({ id: "4", texto: "Novo", ordem: "2" }));

    expect(estado.erro).toBe(
      "Você não tem permissão para editar esta pergunta, ou ela não existe mais.",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
