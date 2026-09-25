import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A importacao em lote de grupos: o que a action faz com o arquivo antes e
 * depois do plano (`importacao.ts`, testado a parte). O banco e a permissao
 * entram como duble.
 */
const { estado, revalidatePathMock } = vi.hoisted(() => ({
  estado: {
    podeAdministrar: true,
    existentes: [] as { nome: string }[],
    erroDaLeitura: null as { message: string } | null,
    erroDoInsert: null as { code: string } | null,
    inseridos: [] as unknown[],
  },
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("@/lib/permissoes", () => ({ podeAdministrarCadastros: async () => estado.podeAdministrar }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (de: number) => ({
            data: de === 0 ? estado.existentes : [],
            error: estado.erroDaLeitura,
          }),
        }),
      }),
      insert: (linhas: unknown[]) => ({
        select: async () => {
          if (estado.erroDoInsert) return { data: null, error: estado.erroDoInsert };
          estado.inseridos.push(...linhas);
          return { data: linhas.map((_, i) => ({ id: i + 1 })), error: null };
        },
      }),
    }),
  }),
}));

const { importarGruposSites } = await import("./actions");

function envio(conteudo: string | Uint8Array<ArrayBuffer>, nome = "grupos.csv") {
  const formData = new FormData();
  formData.set("arquivo", new File([conteudo], nome));
  return importarGruposSites({}, formData);
}

beforeEach(() => {
  estado.podeAdministrar = true;
  estado.existentes = [];
  estado.erroDaLeitura = null;
  estado.erroDoInsert = null;
  estado.inseridos = [];
  revalidatePathMock.mockReset();
});

describe("importarGruposSites", () => {
  it("cria os grupos novos, pula os existentes e revalida a listagem", async () => {
    estado.existentes = [{ nome: "Norte" }];

    const resultado = await envio("Nome;Status\r\nNorte;Ativo\r\nSul;Inativo\r\n");

    expect(resultado).toEqual({
      resultado: {
        criados: 1,
        pulados: [{ linha: 2, nome: "Norte", motivo: "já existe um grupo com esse nome" }],
        erros: [],
      },
    });
    expect(estado.inseridos).toEqual([{ nome: "Sul", descricao: null, ativo: false }]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/cadastros/grupo-de-sites");
  });

  it("nao importa nada quando alguma linha tem erro", async () => {
    const resultado = await envio("Nome;Status\nBom;Ativo\nRuim;Talvez\n");

    expect(resultado.erro).toMatch(/Nenhum grupo foi importado/);
    expect(resultado.resultado?.erros).toHaveLength(1);
    expect(estado.inseridos).toEqual([]);
  });

  it("le o CSV que o Excel em pt-BR grava em Windows-1252", async () => {
    // "Nome;Descrição\nGrupo;Manutenção" em Windows-1252: ç = 0xE7, ã = 0xE3.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("Nome;Descri"), 0xe7, 0xe3, 0x6f,
      ...new TextEncoder().encode("\nGrupo;Manuten"), 0xe7, 0xe3, 0x6f,
    ]);

    await envio(bytes);

    expect(estado.inseridos).toEqual([{ nome: "Grupo", descricao: "Manutenção", ativo: true }]);
  });

  it("recusa quem nao administra cadastros, sem ler o arquivo", async () => {
    estado.podeAdministrar = false;

    expect((await envio("Nome\nA\n")).erro).toMatch(/permissão/);
    expect(estado.inseridos).toEqual([]);
  });

  it("recusa arquivo que nao e .csv", async () => {
    expect((await envio("Nome\nA\n", "grupos.xlsx")).erro).toMatch(/\.csv/);
  });

  it("recusa arquivo vazio ou ausente", async () => {
    expect((await importarGruposSites({}, new FormData())).erro).toMatch(/Escolha o arquivo/);
    expect((await envio("")).erro).toMatch(/Escolha o arquivo/);
  });

  it("recusa arquivo acima de 512 KB", async () => {
    expect((await envio("Nome\n" + "x".repeat(512 * 1024))).erro).toMatch(/512 KB/);
  });

  it("traduz a corrida com outro cadastro de mesmo nome", async () => {
    estado.erroDoInsert = { code: "23505" };

    const resultado = await envio("Nome\nNovo\n");

    expect(resultado.erro).toMatch(/Nada foi importado/);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("falha na leitura dos existentes vira mensagem, nao excecao", async () => {
    estado.erroDaLeitura = { message: "timeout" };

    expect((await envio("Nome\nNovo\n")).erro).toMatch(/Não foi possível importar/);
    expect(estado.inseridos).toEqual([]);
  });
});
