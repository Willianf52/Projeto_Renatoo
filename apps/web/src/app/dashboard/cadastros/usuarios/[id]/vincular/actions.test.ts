import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vincular usuario a grupos de sites. Escreve com service_role: o portao e
 * `podeAdministrarUsuarios()`, e "sem permissao nao le nem grava nada" e o
 * caso que mais importa. So o CLIENTE aceita vinculo.
 */

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const OPERADOR = "22222222-2222-4222-8222-222222222222";

const { estado, chamadas, podeAdministrarUsuariosMock, revalidatePathMock } = vi.hoisted(() => {
  const estado = {
    perfis: {} as Record<string, { id: string; cargo: string }>,
    gruposExistentes: [] as number[],
    vinculosAtuais: [] as number[],
    falharGravacao: false,
  };
  const chamadas: { tipo: string; args: unknown[] }[] = [];
  return {
    estado,
    chamadas,
    podeAdministrarUsuariosMock: vi.fn(async () => true),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/lib/permissoes", () => ({ podeAdministrarUsuarios: podeAdministrarUsuariosMock }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "gestor-que-vincula" } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => ({
        eq: (_coluna: string, valor: string) => {
          if (tabela === "profiles") {
            return { maybeSingle: async () => ({ data: estado.perfis[valor] ?? null, error: null }) };
          }
          // grupos_sites_clientes: o "antes" da auditoria.
          return Promise.resolve({ data: estado.vinculosAtuais.map((grupo_site_id) => ({ grupo_site_id })), error: null });
        },
        in: async (_coluna: string, ids: number[]) => ({
          data: ids.filter((id) => estado.gruposExistentes.includes(id)).map((id) => ({ id })),
          error: null,
        }),
      }),
      delete: () => ({
        eq: async (_coluna: string, id: string) => {
          chamadas.push({ tipo: "apagar", args: [tabela, id] });
          return { error: null };
        },
      }),
      insert: async (linhas: unknown) => {
        chamadas.push({ tipo: "inserir", args: [tabela, linhas] });
        if (tabela === "grupos_sites_clientes" && estado.falharGravacao) return { error: { message: "falhou" } };
        return { error: null };
      },
    }),
  }),
}));

import { vincularGrupos } from "./actions";

async function envio(campos: { usuario?: string; grupos?: string[] }) {
  const dados = new FormData();
  dados.set("usuario_id", campos.usuario ?? CLIENTE);
  for (const grupo of campos.grupos ?? []) dados.append("grupos_do_cliente", grupo);
  try {
    return { estado: await vincularGrupos({}, dados), redirecionou: null as string | null };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "";
    if (!mensagem.startsWith("REDIRECT:")) throw e;
    return { estado: {} as { erro?: string }, redirecionou: mensagem.slice("REDIRECT:".length) };
  }
}

beforeEach(() => {
  estado.perfis = { [CLIENTE]: { id: CLIENTE, cargo: "CLIENTE" }, [OPERADOR]: { id: OPERADOR, cargo: "OPERADOR" } };
  estado.gruposExistentes = [3, 5, 8];
  estado.vinculosAtuais = [];
  estado.falharGravacao = false;
  chamadas.length = 0;
  podeAdministrarUsuariosMock.mockResolvedValue(true);
  revalidatePathMock.mockReset();
});

describe("vincularGrupos: permissao e entrada", () => {
  it("sem permissao, nao le nem grava nada", async () => {
    podeAdministrarUsuariosMock.mockResolvedValue(false);

    const { estado: resultado } = await envio({ grupos: ["3"] });

    expect(resultado.erro).toContain("Apenas Gestor");
    expect(chamadas).toEqual([]);
  });

  it("usuario que nao e uuid e recusado", async () => {
    expect((await envio({ usuario: "nao-e-uuid", grupos: ["3"] })).estado.erro).toBe("Usuário inválido.");
    expect(chamadas).toEqual([]);
  });

  it.each([["0"], ["-2"], ["abc"], ["1.5"]])("grupo %s e recusado", async (grupo) => {
    expect((await envio({ grupos: [grupo] })).estado.erro).toBe("Grupo de sites inválido.");
    expect(chamadas).toEqual([]);
  });

  it("usuario que nao existe e recusado", async () => {
    expect((await envio({ usuario: "33333333-3333-4333-8333-333333333333", grupos: ["3"] })).estado.erro).toBe(
      "Usuário não encontrado.",
    );
    expect(chamadas).toEqual([]);
  });

  it("so o Cliente aceita vinculo: os outros niveis veem todos os sites", async () => {
    const { estado: resultado } = await envio({ usuario: OPERADOR, grupos: ["3"] });

    expect(resultado.erro).toContain("Só o nível Cliente");
    expect(chamadas).toEqual([]);
  });

  it("grupo que nao existe mais e recusado", async () => {
    expect((await envio({ grupos: ["3", "99"] })).estado.erro).toBe("Algum grupo de sites não existe mais.");
    expect(chamadas).toEqual([]);
  });
});

describe("vincularGrupos: gravacao", () => {
  it("troca os grupos, sem repetir e em ordem, e registra o antes e o depois", async () => {
    estado.vinculosAtuais = [8];

    const resultado = await envio({ grupos: ["5", "3", "5"] });

    expect(resultado.redirecionou).toBe("/dashboard/cadastros/usuarios?salvo=1");
    expect(chamadas).toEqual([
      { tipo: "apagar", args: ["grupos_sites_clientes", CLIENTE] },
      {
        tipo: "inserir",
        args: [
          "grupos_sites_clientes",
          [
            { profile_id: CLIENTE, grupo_site_id: 3 },
            { profile_id: CLIENTE, grupo_site_id: 5 },
          ],
        ],
      },
      {
        tipo: "inserir",
        args: [
          "auditoria",
          {
            tabela: "profiles",
            registro_id: CLIENTE,
            operacao: "UPDATE",
            ator_id: "gestor-que-vincula",
            dados_antigos: { grupos_do_cliente: [8] },
            dados_novos: { grupos_do_cliente: [3, 5] },
          },
        ],
      },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/cadastros/usuarios");
  });

  it("sem nenhum marcado, desvincula tudo (so apaga)", async () => {
    estado.vinculosAtuais = [3, 5];

    const resultado = await envio({ grupos: [] });

    expect(resultado.redirecionou).toBe("/dashboard/cadastros/usuarios?salvo=1");
    expect(chamadas.map((c) => c.tipo + ":" + String(c.args[0]))).toEqual([
      "apagar:grupos_sites_clientes",
      "inserir:auditoria",
    ]);
  });

  it("falha ao gravar devolve o erro, sem auditoria nem redirecionamento", async () => {
    estado.falharGravacao = true;

    const resultado = await envio({ grupos: ["3"] });

    expect(resultado.estado.erro).toBe("Não foi possível salvar o vínculo. Tente de novo.");
    expect(resultado.redirecionou).toBeNull();
    expect(chamadas.some((c) => c.args[0] === "auditoria")).toBe(false);
  });
});
