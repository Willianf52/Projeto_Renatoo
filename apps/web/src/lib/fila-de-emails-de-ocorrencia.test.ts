import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const enviar = vi.fn();
const configuracao = vi.fn();
vi.mock("@/lib/resend", () => ({
  enviarEmailDeOcorrencia: (...args: unknown[]) => enviar(...args),
  configuracaoDoRemetente: () => configuracao(),
}));
vi.mock("@/lib/log", () => ({ erro: vi.fn() }));

const { processarFilaDeEmails } = await import("./fila-de-emails-de-ocorrencia");

type Linha = { id: number; ocorrencia_id: number; andamento_id: number | null; motivo: string; destinatario: string };

/** Banco falso: so o que a fila usa -- rpc, select ... in/eq, update ... eq. */
function bancoFalso(lote: Linha[], tentativas = 1) {
  const updates: { id: number; dados: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async () => ({ data: lote, error: null }));
  const from = (tabela: string) => ({
    select: () => ({
      in: async () =>
        tabela === "ocorrencias"
          ? {
              data: [
                {
                  id: 7,
                  numero: 5,
                  ano: 2026,
                  criado_em: "2026-10-06T21:29:23Z",
                  pergunta_texto: "Uniformes",
                  resposta: "NAO",
                  observacao: null,
                  eventos: { nome: "Uniforme" },
                  sites: { nome: "Posto" },
                },
              ],
              error: null,
            }
          : { data: [{ id: 3, texto: "Resolvido" }], error: null },
      eq: () => ({ maybeSingle: async () => ({ data: { tentativas }, error: null }) }),
    }),
    update: (dados: Record<string, unknown>) => ({
      eq: async (_coluna: string, id: number) => {
        updates.push({ id, dados });
        return { error: null };
      },
    }),
  });
  return { admin: { rpc, from } as never, rpc, updates };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
  enviar.mockReset();
  configuracao.mockReturnValue({ remetente: "Teste <t@x>", somente: null });
});

describe("processarFilaDeEmails", () => {
  it("envia cada linha e marca ENVIADO, com o link da ocorrência e chave de idempotência", async () => {
    enviar.mockResolvedValue("re_1");
    const { admin, updates } = bancoFalso([
      { id: 1, ocorrencia_id: 7, andamento_id: null, motivo: "ABERTURA", destinatario: "a@x.test" },
      { id: 2, ocorrencia_id: 7, andamento_id: 3, motivo: "FINALIZACAO", destinatario: "b@x.test" },
    ]);

    const resultado = await processarFilaDeEmails(admin, "https://portal.test", "req");

    expect(resultado).toEqual({ enviados: 2, falhas: 0 });
    expect(enviar).toHaveBeenNthCalledWith(1, expect.objectContaining({ para: "a@x.test", chave: "ocorrencia-email-1" }));
    expect(enviar.mock.calls[0][0].texto).toContain("https://portal.test/dashboard/eventos/painel-de-eventos/7");
    expect(enviar.mock.calls[1][0].texto).toContain("Ações realizadas:\nResolvido");
    expect(updates.map((u) => [u.id, u.dados.status, u.dados.id_externo])).toEqual([
      [1, "ENVIADO", "re_1"],
      [2, "ENVIADO", "re_1"],
    ]);
  });

  it("falha antes da terceira tentativa volta para a fila; na terceira, FALHOU", async () => {
    enviar.mockRejectedValue(new Error("limite da Resend"));
    const linha = { id: 9, ocorrencia_id: 7, andamento_id: null, motivo: "ABERTURA", destinatario: "a@x.test" };

    const primeira = bancoFalso([linha], 1);
    expect(await processarFilaDeEmails(primeira.admin, "https://portal.test", "req")).toEqual({ enviados: 0, falhas: 1 });
    expect(primeira.updates[0].dados).toMatchObject({ status: "PENDENTE", erro: "limite da Resend" });

    const terceira = bancoFalso([linha], 3);
    await processarFilaDeEmails(terceira.admin, "https://portal.test", "req");
    expect(terceira.updates[0].dados).toMatchObject({ status: "FALHOU" });
  });

  it("modo de teste: pede ao banco só os destinatários permitidos", async () => {
    configuracao.mockReturnValue({ remetente: "Teste <t@x>", somente: ["dono@x.test"] });
    const { admin, rpc } = bancoFalso([]);

    await processarFilaDeEmails(admin, "https://portal.test", "req");

    expect(rpc).toHaveBeenCalledWith("reservar_emails_de_ocorrencia", { p_limite: 20, p_somente: ["dono@x.test"] });
  });

  it("modo de teste sem o dono da conta configurado não reserva nada", async () => {
    configuracao.mockReturnValue({ remetente: "Teste <t@x>", somente: [] });
    const { admin, rpc } = bancoFalso([]);

    expect(await processarFilaDeEmails(admin, "https://portal.test", "req")).toEqual({ enviados: 0, falhas: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
