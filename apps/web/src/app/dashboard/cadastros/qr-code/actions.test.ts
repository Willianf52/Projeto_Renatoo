import { beforeEach, describe, expect, it, vi } from "vitest";

type ErroSupabase = { code: string } | null;

const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(
  () => {
    const resultados = {
      insert: { error: null as ErroSupabase },
      update: { data: null as { id: number } | null, error: null as ErroSupabase },
    };
    const chamadas: Array<{ tipo: "insert" | "update"; linha: Record<string, unknown> }> = [];

    const createClientMock = vi.fn(async () => ({
      from: () => ({
        insert: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "insert", linha });
          return Promise.resolve(resultados.insert);
        },
        update: (linha: Record<string, unknown>) => {
          chamadas.push({ tipo: "update", linha });
          return {
            eq: () => ({
              select: () => ({ maybeSingle: () => Promise.resolve(resultados.update) }),
            }),
          };
        },
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

const { salvarQrCode } = await import("./actions");

const LISTAGEM = "/dashboard/cadastros/qr-code";

/** Campos minimos para passar na validacao. */
const MINIMO = { codigo: "QR-AGC-001", site_id: "7" };

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

describe("salvarQrCode", () => {
  describe("validação do código", () => {
    it("recusa código vazio", async () => {
      const estado = await salvarQrCode({}, formulario({ ...MINIMO, codigo: "  " }));

      expect(estado.erro).toBe("Informe o código do QR.");
      expect(chamadas).toHaveLength(0);
    });

    /**
     * O caso que motiva a lista fechada de caracteres: o codigo e lido de uma
     * etiqueta e depois casado por texto na importacao
     * (`lib/importar-coletas.ts`). Espaco no meio sobrevive ao trim das bordas
     * e produz um cadastro que parece certo na tela e nunca casa com o lote --
     * defeito que ninguem liga ao cadastro.
     */
    it("recusa espaço no meio do código", async () => {
      const estado = await salvarQrCode({}, formulario({ ...MINIMO, codigo: "QR AGC 001" }));

      expect(estado.erro).toContain("sem espaços");
      expect(chamadas).toHaveLength(0);
    });

    it("recusa caractere fora da lista permitida", async () => {
      for (const codigo of ["QR#001", "QR/001", "QR\t001"]) {
        chamadas.length = 0;
        const estado = await salvarQrCode({}, formulario({ ...MINIMO, codigo }));
        expect(estado.erro).toContain("apenas letras, números");
        expect(chamadas).toHaveLength(0);
      }
    });

    it("aceita ponto, hífen e sublinhado", async () => {
      for (const codigo of ["QR-AGC-001", "QR.AGC.001", "QR_AGC_001", "qr001"]) {
        chamadas.length = 0;
        await salvarQrCode({}, formulario({ ...MINIMO, codigo }));
        expect(chamadas[0]?.linha.codigo).toBe(codigo);
      }
    });

    it("apara espaços das bordas antes de validar", async () => {
      await salvarQrCode({}, formulario({ ...MINIMO, codigo: "  QR-AGC-001  " }));

      expect(chamadas[0].linha.codigo).toBe("QR-AGC-001");
    });
  });

  describe("validação do site", () => {
    it("recusa sem site", async () => {
      // `site_id` e `not null` no banco (migration 0003): sem esta checagem o
      // insert falharia com o texto cru do Postgres.
      const estado = await salvarQrCode({}, formulario({ codigo: "QR-001" }));

      expect(estado.erro).toBe("Selecione o site.");
      expect(chamadas).toHaveLength(0);
    });

    it("converte o site para número", async () => {
      await salvarQrCode({}, formulario(MINIMO));

      expect(chamadas[0].linha.site_id).toBe(7);
    });
  });

  describe("normalização", () => {
    it("cria o QR e volta para a listagem", async () => {
      await salvarQrCode({}, formulario({ ...MINIMO, finalidade: "Entrada", ativo: "on" }));

      expect(chamadas).toEqual([
        {
          tipo: "insert",
          linha: { codigo: "QR-AGC-001", site_id: 7, finalidade: "Entrada", ativo: true },
        },
      ]);
      expect(revalidatePathMock).toHaveBeenCalledWith(LISTAGEM);
      expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
    });

    it("converte finalidade vazia em null, e não em string vazia", async () => {
      // "" e um valor; null e "nao informado". A listagem distingue os dois.
      await salvarQrCode({}, formulario({ ...MINIMO, finalidade: "   " }));

      expect(chamadas[0].linha.finalidade).toBeNull();
    });

    it("fica inativo quando o checkbox não vem", async () => {
      // Checkbox nao marcado nao e enviado pelo navegador: ausencia e false.
      await salvarQrCode({}, formulario(MINIMO));

      expect(chamadas[0].linha.ativo).toBe(false);
    });

    it("devolve o que a pessoa digitou junto do erro", async () => {
      const estado = await salvarQrCode(
        {},
        formulario({ ...MINIMO, codigo: "QR 001", finalidade: "Portaria" }),
      );

      expect(estado.valores?.finalidade).toBe("Portaria");
    });
  });

  describe("erros do banco", () => {
    it("traduz código duplicado", async () => {
      resultados.insert = { error: { code: "23505" } };

      const estado = await salvarQrCode({}, formulario(MINIMO));

      expect(estado.erro).toBe("Já existe um QR-Code com esse código.");
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("traduz insert barrado pelo RLS", async () => {
      resultados.insert = { error: { code: "42501" } };

      const estado = await salvarQrCode({}, formulario(MINIMO));

      expect(estado.erro).toBe("Você não tem permissão para cadastrar QR-Codes.");
    });

    it("traduz site que sumiu entre o formulário e o envio", async () => {
      resultados.insert = { error: { code: "23503" } };

      const estado = await salvarQrCode({}, formulario(MINIMO));

      expect(estado.erro).toContain("não existe mais");
    });
  });

  describe("edição", () => {
    it("atualiza quando o id vem no formulário", async () => {
      await salvarQrCode({}, formulario({ ...MINIMO, id: "42" }));

      expect(chamadas[0].tipo).toBe("update");
      expect(redirectMock).toHaveBeenCalledWith(LISTAGEM);
    });

    it("recusa id que não é inteiro", async () => {
      const estado = await salvarQrCode({}, formulario({ ...MINIMO, id: "abc" }));

      expect(estado.erro).toBe("Registro inválido.");
      expect(chamadas).toHaveLength(0);
    });

    /**
     * UPDATE barrado pelo RLS nao devolve erro, devolve zero linhas alteradas.
     * Sem conferir isso, quem nao tem permissao veria sucesso e voltaria para
     * a listagem com o registro intacto.
     */
    it("avisa quando o update não alterou linha nenhuma", async () => {
      resultados.update = { data: null, error: null };

      const estado = await salvarQrCode({}, formulario({ ...MINIMO, id: "42" }));

      expect(estado.erro).toContain("não tem permissão para editar este QR-Code");
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });
});
