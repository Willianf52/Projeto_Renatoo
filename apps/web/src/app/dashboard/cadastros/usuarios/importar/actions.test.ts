import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Importar usuarios. Como o formulario, escreve com service_role: o portao e
 * `podeAdministrarUsuarios()`, e "sem permissao nao le nem grava nada" e o caso
 * que mais importa. O planejador (`../importacao.ts`) tem teste proprio.
 */

type Erro = { message: string } | null;

const { estado, chamadas, podeAdministrarUsuariosMock, senhaVazadaMock, revalidatePathMock } = vi.hoisted(() => {
  const estado = {
    perfis: [] as { id: string; email: string | null; nome_completo: string; login: string | null }[],
    grupos: [] as { id: number; nome: string }[],
    /** E-mails cujo createUser falha (simula "ja registrado" no Auth). */
    falharCriacao: new Set<string>(),
    proximoId: 1,
    erroDaLeitura: null as Erro,
  };
  const chamadas: { tipo: string; args: unknown[] }[] = [];
  return {
    estado,
    chamadas,
    podeAdministrarUsuariosMock: vi.fn(async () => true),
    senhaVazadaMock: vi.fn(async () => false),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/lib/permissoes", () => ({ podeAdministrarUsuarios: podeAdministrarUsuariosMock }));
vi.mock("@/lib/senha-vazada", () => ({ senhaVazada: senhaVazadaMock }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "gestor-que-importa" } } }) },
    from: (tabela: string) => ({
      select: () => {
        const consulta = {
          order: () => consulta,
          range: async (de: number) => ({
            data: de === 0 ? (tabela === "profiles" ? estado.perfis : estado.grupos) : [],
            error: estado.erroDaLeitura,
          }),
        };
        return consulta;
      },
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: async (dados: { email: string; password: string }) => {
          chamadas.push({ tipo: "createUser", args: [dados.email] });
          if (estado.falharCriacao.has(dados.email)) {
            return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          }
          return { data: { user: { id: `id-${estado.proximoId++}` } }, error: null };
        },
        deleteUser: async (id: string) => {
          chamadas.push({ tipo: "deleteUser", args: [id] });
          return { error: null };
        },
      },
    },
    from: (tabela: string) => ({
      update: (linha: Record<string, unknown>) => ({
        eq: async (_coluna: string, id: string) => {
          chamadas.push({ tipo: "updatePerfil", args: [id, linha] });
          return { error: null };
        },
      }),
      insert: async (linha: unknown) => {
        chamadas.push({ tipo: `insert:${tabela}`, args: [linha] });
        return { error: null };
      },
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const { importarUsuarios } = await import("./actions");

const SENHA = "Teste@123";

function envio(linhas: string[], opcoes: { modo?: string; senha?: string } = {}) {
  const formData = new FormData();
  const csv = ["Nome;Login;E-mail;Nível de Acesso;Usuário Superior", ...linhas].join("\r\n");
  formData.set("arquivo", new File([csv], "usuarios.csv"));
  if (opcoes.modo) formData.set("modo", opcoes.modo);
  if (opcoes.senha !== undefined) formData.set("senha", opcoes.senha);
  return importarUsuarios({}, formData);
}

const ARQUIVO = [
  "Gilmar;Gilmar@servicosup;operacional010@servicosup.com;Operacional;Gesiel",
  "Gesiel;novo.gesiel@servicosup.com.br;gesiel@servicosup.com.br;Gestor;",
  "Ana;ana@exemplo.com;;Supervisor;",
];

beforeEach(() => {
  estado.perfis = [];
  estado.grupos = [];
  estado.falharCriacao = new Set();
  estado.proximoId = 1;
  estado.erroDaLeitura = null;
  chamadas.length = 0;
  podeAdministrarUsuariosMock.mockResolvedValue(true);
  senhaVazadaMock.mockResolvedValue(false);
  revalidatePathMock.mockReset();
});

describe("importarUsuarios: permissao e arquivo", () => {
  it("sem permissao, nem le o arquivo e nao grava nada", async () => {
    podeAdministrarUsuariosMock.mockResolvedValue(false);

    const resultado = await envio(ARQUIVO, { modo: "importar", senha: SENHA });

    expect(resultado.erro).toContain("Apenas Gestor");
    expect(chamadas).toEqual([]);
  });

  it("recusa arquivo ausente ou que nao e .csv", async () => {
    expect(await importarUsuarios({}, new FormData())).toEqual({ erro: "Escolha o arquivo .csv com os usuários." });
    const formData = new FormData();
    formData.set("arquivo", new File(["x"], "usuarios.xlsx"));
    expect((await importarUsuarios({}, formData)).erro).toMatch(/precisa ser \.csv/);
  });
});

describe("importarUsuarios: pre-visualizacao", () => {
  it("mostra o plano, nao exige senha e nao grava nada", async () => {
    estado.perfis = [{ id: "p1", email: "ana@exemplo.com", nome_completo: "Ana", login: null }];

    const resultado = await envio(ARQUIVO);

    expect(resultado.previa).toEqual({
      novos: [
        { linha: 2, nome: "Gilmar", email: "operacional010@servicosup.com", nivel: "Operacional", superior: "Gesiel" },
        { linha: 3, nome: "Gesiel", email: "novo.gesiel@servicosup.com.br", nivel: "Gestor", superior: null },
      ],
      existentes: [{ linha: 4, nome: "Ana", email: "ana@exemplo.com" }],
      clientesSemGrupo: 0,
    });
    expect(chamadas).toEqual([]);
    expect(senhaVazadaMock).not.toHaveBeenCalled();
  });

  it("com linha errada, nao cria ninguem", async () => {
    const resultado = await envio(["Fulano;so-login;;Gestor;"], { modo: "importar", senha: SENHA });

    expect(resultado.erro).toBe("Nenhum usuário foi criado. Corrija as linhas abaixo e envie o arquivo de novo.");
    expect(resultado.erros?.[0].mensagem).toContain("sem e-mail de acesso válido");
    expect(chamadas).toEqual([]);
  });
});

describe("importarUsuarios: senha provisoria", () => {
  it("sem senha, senha fraca ou vazada: recusa e devolve a previa", async () => {
    const semSenha = await envio(ARQUIVO, { modo: "importar" });
    expect(semSenha.erro).toBe("Digite a senha provisória dos novos usuários.");
    expect(semSenha.previa?.novos).toHaveLength(3);

    const fraca = await envio(ARQUIVO, { modo: "importar", senha: "123456" });
    expect(fraca.erro).toContain("não atende aos requisitos");

    senhaVazadaMock.mockResolvedValue(true);
    const vazada = await envio(ARQUIVO, { modo: "importar", senha: SENHA });
    expect(vazada.erro).toContain("vazamentos");

    expect(chamadas).toEqual([]);
  });

  it("a senha nunca volta na resposta", async () => {
    const resultado = await envio(ARQUIVO, { modo: "importar", senha: SENHA });
    expect(JSON.stringify(resultado)).not.toContain(SENHA);
  });
});

describe("importarUsuarios: gravacao", () => {
  it("cria o superior antes e liga o subordinado a ele", async () => {
    const resultado = await envio(ARQUIVO, { modo: "importar", senha: SENHA });

    expect(resultado.resultado).toEqual({ criados: 3, falhas: [], semSuperior: [] });

    const criados = chamadas.filter((c) => c.tipo === "createUser").map((c) => c.args[0]);
    // Gesiel (nivel 0) antes de Gilmar (nivel 1), mesmo vindo depois no arquivo.
    expect(criados.indexOf("novo.gesiel@servicosup.com.br")).toBeLessThan(criados.indexOf("operacional010@servicosup.com"));

    const idDoGesiel = `id-${criados.indexOf("novo.gesiel@servicosup.com.br") + 1}`;
    const perfilDoGilmar = chamadas.find(
      (c) => c.tipo === "updatePerfil" && (c.args[1] as { nome_completo: string }).nome_completo === "Gilmar",
    );
    expect(perfilDoGilmar?.args[1]).toMatchObject({ cargo: "OPERACIONAL", superior_id: idDoGesiel, ativo: true });

    // A trilha leva quem importou.
    expect(chamadas.filter((c) => c.tipo === "insert:auditoria")).toHaveLength(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/cadastros/usuarios");
  });

  it("uma conta que falha nao para as outras, e o subordinado dela entra sem superior", async () => {
    estado.falharCriacao.add("novo.gesiel@servicosup.com.br");

    const resultado = await envio(ARQUIVO, { modo: "importar", senha: SENHA });

    expect(resultado.resultado?.criados).toBe(2);
    expect(resultado.resultado?.falhas).toEqual([
      { linha: 3, nome: "Gesiel", erro: "Já existe um usuário com esse e-mail." },
    ]);
    expect(resultado.resultado?.semSuperior).toEqual(["Gilmar"]);
  });

  it("quem ja existe no portal nao e criado de novo", async () => {
    estado.perfis = [
      { id: "p1", email: "operacional010@servicosup.com", nome_completo: "Gilmar", login: null },
      { id: "p2", email: "novo.gesiel@servicosup.com.br", nome_completo: "Gesiel", login: null },
      { id: "p3", email: "ana@exemplo.com", nome_completo: "Ana", login: null },
    ];

    const resultado = await envio(ARQUIVO, { modo: "importar", senha: SENHA });

    expect(resultado.resultado).toEqual({ criados: 0, falhas: [], semSuperior: [] });
    expect(chamadas).toEqual([]);
  });
});
