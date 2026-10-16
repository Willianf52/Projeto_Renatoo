import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, resultado, redirectMock } = vi.hoisted(() => ({
  rpc: vi.fn(),
  resultado: { error: null as { code?: string; message?: string } | null },
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nome: string, args: unknown) => {
      rpc(nome, args);
      return { data: 1, error: resultado.error };
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { salvarEvento } = await import("./actions");

function formulario(campos: Record<string, string | string[]>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) dados.append(chave, v);
  }
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
  resultado.error = null;
});

describe("salvarEvento", () => {
  it("manda evento, sites e e-mails numa chamada so, com os prazos em minutos", async () => {
    await salvarEvento(
      {},
      formulario({
        nome: "Portaria",
        superior_id: "",
        sites: ["7", "9"],
        emails: "A@x.com, b@y.com",
        tempo_quantidade: "2",
        tempo_unidade: "hour",
        bloqueio_quantidade: "",
        bloqueio_unidade: "hour",
        status: "ativo",
      }),
    );

    expect(rpc).toHaveBeenCalledWith("salvar_evento", {
      p_id: null,
      p_nome: "Portaria",
      p_descricao: null,
      p_superior_id: null,
      p_tempo_atendimento_minutos: 120,
      p_bloqueio_repeticao_minutos: null,
      p_ativo: true,
      p_sites: [7, 9],
      p_emails: ["a@x.com", "b@y.com"],
    });
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/eventos/cadastro-de-eventos?salvo=1");
  });

  it("recusa ser superior de si mesmo e e-mail invalido sem chegar ao banco", async () => {
    expect((await salvarEvento({}, formulario({ id: "3", nome: "X", superior_id: "3" }))).erro).toContain("si mesmo");
    expect((await salvarEvento({}, formulario({ nome: "X", emails: "nao-e-email" }))).erro).toContain("E-mail inválido");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduz nome repetido, falta de permissao e a regra de um nivel do banco", async () => {
    resultado.error = { code: "23505" };
    expect((await salvarEvento({}, formulario({ nome: "X" }))).erro).toBe("Já existe um evento com esse nome.");
    resultado.error = { code: "42501" };
    expect((await salvarEvento({}, formulario({ nome: "X" }))).erro).toContain("Somente o Gestor");
    resultado.error = { code: "23514", message: "O evento superior não pode ser um subtipo." };
    expect((await salvarEvento({}, formulario({ nome: "X", superior_id: "2" }))).erro).toBe(
      "O evento superior não pode ser um subtipo.",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
