import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  pode: true,
  rpc: vi.fn(async (_nome: string, _args: unknown) => ({ error: null as unknown })),
  resultadoDoDelete: { data: [{ id: 9 }], error: null } as { data: unknown; error: unknown },
  redirect: vi.fn((destino: string) => {
    throw new Error(`redirect:${destino}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: estado.redirect }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("@/lib/permissoes", () => ({ podeAdministrarUsuarios: async () => estado.pode }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: estado.rpc,
    from: () => ({ delete: () => ({ eq: () => ({ select: async () => estado.resultadoDoDelete }) }) }),
  }),
}));

const { cadastrarColetas, excluirColeta } = await import("./actions");

const UUID = "0b6c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e";
const VALIDO = { data: "2026-10-06", hora: "14:30", funcionario_id: UUID, site_id: "12", quantidade: "2" };

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  estado.pode = true;
  estado.rpc.mockClear();
  estado.rpc.mockResolvedValue({ error: null });
  estado.resultadoDoDelete = { data: [{ id: 9 }], error: null };
});

describe("cadastrarColetas", () => {
  it("chama o banco e volta filtrada no dia da coleta", async () => {
    await expect(cadastrarColetas({}, formulario({ ...VALIDO, evento_id: "7" }))).rejects.toThrow(
      "redirect:/dashboard/inspecoes/coletas-importadas?data_inicial=2026-10-06&data_final=2026-10-06&salvo=1",
    );

    expect(estado.rpc).toHaveBeenCalledWith("cadastrar_coletas_manuais", {
      p_site_id: 12,
      p_funcionario_id: UUID,
      p_data_hora: "2026-10-06T14:30:00-03:00",
      p_quantidade: 2,
      p_coletor_dados_id: undefined,
      p_area_id: undefined,
      p_evento_id: 7,
      p_acao_id: undefined,
      p_qualificador_id: undefined,
    });
  });

  it("erro de validacao devolve os valores para o formulario nao voltar em branco", async () => {
    const resultado = await cadastrarColetas({}, formulario({ ...VALIDO, site_id: "" }));

    expect(resultado.erro).toBe("Escolha o local.");
    expect(resultado.valores).toMatchObject({ data: "2026-10-06", quantidade: "2", site_id: "" });
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("conta sem permissao para antes do banco", async () => {
    estado.pode = false;

    expect((await cadastrarColetas({}, formulario(VALIDO))).erro).toBe("Sua conta não pode cadastrar coletas.");
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("data fora da janela de 30 dias tem mensagem propria", async () => {
    estado.rpc.mockResolvedValueOnce({ error: { code: "22008", message: "x" } });

    expect((await cadastrarColetas({}, formulario(VALIDO))).erro).toBe(
      "A data da coleta deve ficar entre os últimos 30 dias e agora.",
    );
  });
});

describe("excluirColeta", () => {
  it("exclui e volta para a mesma listagem filtrada, com o aviso", async () => {
    await expect(
      excluirColeta({}, formulario({ leitura_id: "9", filtros: "data_inicial=2026-10-01&data_final=2026-10-06&salvo=1" })),
    ).rejects.toThrow(
      "redirect:/dashboard/inspecoes/coletas-importadas?data_inicial=2026-10-01&data_final=2026-10-06&excluido=1",
    );
  });

  it("coleta de visita com checklist: o banco recusa e a mensagem aponta o Historico", async () => {
    estado.resultadoDoDelete = { data: null, error: { code: "23514", message: "x" } };

    expect((await excluirColeta({}, formulario({ leitura_id: "9" }))).erro).toBe(
      "Esta coleta é de uma visita com checklist enviado. Exclua o checklist no Histórico de Checklist.",
    );
  });

  it("id torto, sem permissao e linha que nao existe mais", async () => {
    expect(await excluirColeta({}, formulario({ leitura_id: "abc" }))).toEqual({ erro: "Coleta inválida." });

    estado.resultadoDoDelete = { data: [], error: null };
    expect(await excluirColeta({}, formulario({ leitura_id: "9" }))).toEqual({
      erro: "Coleta não encontrada. Ela pode já ter sido excluída.",
    });

    estado.pode = false;
    expect(await excluirColeta({}, formulario({ leitura_id: "9" }))).toEqual({
      erro: "Sua conta não pode excluir coletas.",
    });
  });
});
