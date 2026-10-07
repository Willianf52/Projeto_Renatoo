import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  podeExcluir: true,
  midia: { assinatura_path: "7/assinatura.png", checklist_fotos: [{ storage_path: "7/foto-1.jpg" }] } as unknown,
  resultadoDoDelete: { data: [{ id: 3 }], error: null } as { data: unknown; error: unknown },
  remove: vi.fn(async (_caminhos: string[]) => ({ error: null as unknown })),
  redirect: vi.fn((destino: string) => {
    throw new Error(`redirect:${destino}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: estado.redirect }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));
vi.mock("@/lib/permissoes", () => ({ podeAdministrarUsuarios: async () => estado.podeExcluir }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ remove: estado.remove }) } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: estado.midia, error: null }) }) }),
      delete: () => ({ eq: () => ({ select: async () => estado.resultadoDoDelete }) }),
    }),
  }),
}));

const { excluirChecklist } = await import("./actions");

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

beforeEach(() => {
  estado.podeExcluir = true;
  estado.midia = { assinatura_path: "7/assinatura.png", checklist_fotos: [{ storage_path: "7/foto-1.jpg" }] };
  estado.resultadoDoDelete = { data: [{ id: 3 }], error: null };
  estado.remove.mockClear();
  estado.redirect.mockClear();
});

describe("excluirChecklist", () => {
  it("exclui, apaga assinatura e fotos do Storage e volta com os mesmos filtros", async () => {
    await expect(
      excluirChecklist({}, formulario({ checklist_id: "3", filtros: "site=4&pagina=2" })),
    ).rejects.toThrow("redirect:/dashboard/checklistlab/historico-de-checklist?site=4&pagina=2&salvo=1");

    expect(estado.remove).toHaveBeenCalledWith(["7/assinatura.png", "7/foto-1.jpg"]);
  });

  it("id torto e conta sem permissao param antes do banco", async () => {
    expect(await excluirChecklist({}, formulario({ checklist_id: "abc" }))).toEqual({ erro: "Checklist inválido." });

    estado.podeExcluir = false;
    expect(await excluirChecklist({}, formulario({ checklist_id: "3" }))).toEqual({
      erro: "Sua conta não pode excluir checklists.",
    });
    expect(estado.remove).not.toHaveBeenCalled();
  });

  it("ocorrencia ja analisada: o banco recusa e nenhum arquivo sai", async () => {
    estado.resultadoDoDelete = { data: null, error: { code: "23514", message: "x" } };

    expect(await excluirChecklist({}, formulario({ checklist_id: "3" }))).toEqual({
      erro: "Este checklist tem ocorrência já analisada ou finalizada e não pode ser excluído.",
    });
    expect(estado.remove).not.toHaveBeenCalled();
  });

  it("DELETE sem linha (a policy nao alcancou): nenhum arquivo sai", async () => {
    estado.resultadoDoDelete = { data: [], error: null };

    expect(await excluirChecklist({}, formulario({ checklist_id: "3" }))).toEqual({
      erro: "Sua conta não pode excluir este checklist.",
    });
    expect(estado.remove).not.toHaveBeenCalled();
  });

  it("falha no Storage nao desfaz a exclusao: so vai para o log", async () => {
    estado.remove.mockResolvedValueOnce({ error: { message: "fora do ar" } });

    await expect(excluirChecklist({}, formulario({ checklist_id: "3" }))).rejects.toThrow(
      "redirect:/dashboard/checklistlab/historico-de-checklist?salvo=1",
    );
  });

  it("checklist que nao existe mais", async () => {
    estado.midia = null;

    expect(await excluirChecklist({}, formulario({ checklist_id: "3" }))).toEqual({
      erro: "Checklist não encontrado. Ele pode já ter sido excluído.",
    });
  });
});
