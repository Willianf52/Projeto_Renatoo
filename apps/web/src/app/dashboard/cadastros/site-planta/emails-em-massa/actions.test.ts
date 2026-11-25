import { beforeEach, describe, expect, it, vi } from "vitest";

const { estado, chamadas, podeMock } = vi.hoisted(() => {
  const estado = {
    sitesDosGrupos: { data: [] as { id: number }[] | null, error: null as { code: string } | null },
    update: { data: [] as { id: number }[] | null, error: null as { code: string } | null },
  };
  const chamadas: Array<{ tipo: string; args: unknown[] }> = [];
  return { estado, chamadas, podeMock: vi.fn(async () => true) };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        in: (coluna: string, valores: number[]) => {
          chamadas.push({ tipo: "select", args: [coluna, valores] });
          return Promise.resolve(estado.sitesDosGrupos);
        },
      }),
      update: (linha: Record<string, unknown>) => ({
        in: (coluna: string, valores: number[]) => {
          chamadas.push({ tipo: "update", args: [linha, coluna, valores] });
          return { select: () => Promise.resolve(estado.update) };
        },
      }),
    }),
  })),
}));
vi.mock("@/lib/permissoes", () => ({ podeAdministrarCadastros: podeMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { alterarEmailsEmMassa } = await import("./actions");

function formulario(campos: Record<string, string | string[]>) {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) dados.append(chave, v);
  }
  return dados;
}

beforeEach(() => {
  chamadas.length = 0;
  podeMock.mockResolvedValue(true);
  estado.sitesDosGrupos = { data: [], error: null };
  estado.update = { data: [], error: null };
});

describe("alterarEmailsEmMassa", () => {
  it("inclui os locais dos grupos e substitui a lista marcada", async () => {
    estado.sitesDosGrupos = { data: [{ id: 7 }, { id: 8 }], error: null };
    estado.update = { data: [{ id: 5 }, { id: 7 }, { id: 8 }], error: null };

    const r = await alterarEmailsEmMassa(
      {},
      formulario({ grupos: ["2"], locais: ["5", "7"], emails: "a@x.com", tipos: ["eventos"] }),
    );

    expect(r).toEqual({ sucesso: "E-mails alterados em 3 locais." });
    expect(chamadas).toEqual([
      { tipo: "select", args: ["grupo_site_id", [2]] },
      { tipo: "update", args: [{ emails_eventos: ["a@x.com"] }, "id", [5, 7, 8]] },
    ]);
  });

  it("sem grupos, nao consulta os locais de grupo", async () => {
    estado.update = { data: [{ id: 5 }], error: null };
    const r = await alterarEmailsEmMassa({}, formulario({ locais: ["5"], emails: "a@x.com", tipos: ["checklists"] }));
    expect(r).toEqual({ sucesso: "E-mails alterados em 1 local." });
    expect(chamadas.map((c) => c.tipo)).toEqual(["update"]);
  });

  it("quem nao administra cadastros e recusado antes de gravar", async () => {
    podeMock.mockResolvedValue(false);
    const r = await alterarEmailsEmMassa({}, formulario({ locais: ["5"], emails: "a@x.com", tipos: ["checklists"] }));
    expect(r).toEqual({ erro: "Você não tem permissão para alterar sites." });
    expect(chamadas).toEqual([]);
  });

  it("formulario invalido nao chega ao banco", async () => {
    const r = await alterarEmailsEmMassa({}, formulario({ locais: ["5"], emails: "a@x.com" }));
    expect(r).toEqual({ erro: "Marque ao menos um tipo de atualização." });
    expect(chamadas).toEqual([]);
  });

  it("grupo sem nenhum local avisa e nao grava", async () => {
    const r = await alterarEmailsEmMassa({}, formulario({ grupos: ["9"], emails: "a@x.com", tipos: ["checklists"] }));
    expect(r).toEqual({ erro: "Os grupos escolhidos não têm nenhum local." });
    expect(chamadas.map((c) => c.tipo)).toEqual(["select"]);
  });

  it("zero linhas alteradas (RLS) vira aviso de permissao, nao sucesso", async () => {
    const r = await alterarEmailsEmMassa({}, formulario({ locais: ["5"], emails: "a@x.com", tipos: ["checklists"] }));
    expect(r).toEqual({ erro: "Nenhum local foi alterado: você não tem permissão para editá-los." });
  });

  it("erro do banco vira mensagem generica", async () => {
    estado.update = { data: null, error: { code: "23514" } };
    const r = await alterarEmailsEmMassa({}, formulario({ locais: ["5"], emails: "a@x.com", tipos: ["checklists"] }));
    expect(r).toEqual({ erro: "Não foi possível alterar os e-mails. Tente novamente." });
  });
});
