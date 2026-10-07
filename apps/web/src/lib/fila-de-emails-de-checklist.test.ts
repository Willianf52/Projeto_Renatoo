import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const enviar = vi.fn();
const configuracao = vi.fn();
vi.mock("@/lib/resend", () => ({
  enviarEmailDeOcorrencia: (...args: unknown[]) => enviar(...args),
  configuracaoDoRemetente: () => configuracao(),
}));
vi.mock("@/lib/log", () => ({ erro: vi.fn() }));

const { processarFilaDeEmailsDeChecklist, resumoDasRespostas } = await import("./fila-de-emails-de-checklist");

type Linha = { id: number; checklist_id: number; destinatario: string };

const CHECKLIST = {
  id: 31,
  tipo: "CONSULTORIA",
  motivo: null,
  criado_em: "2026-10-06T21:29:23Z",
  modelos_checklist: { nome: "Portaria" },
  visitas: { sites: { nome: "Posto Central" }, profiles: { nome_completo: "Ana Souza" } },
  checklist_respostas: [
    { resposta: "SIM", perguntas_checklist: { tipo_resposta: "CNA" } },
    { resposta: "NAO", perguntas_checklist: { tipo_resposta: "CNA" } },
    { resposta: "NAO", perguntas_checklist: { tipo_resposta: "SN" } },
  ],
};

/** Banco falso: so o que a fila usa -- rpc, select ... in/eq, update ... eq. */
function bancoFalso(lote: Linha[], tentativas = 1) {
  const updates: { id: number; dados: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async () => ({ data: lote, error: null }));
  const from = () => ({
    select: () => ({
      in: async () => ({ data: [CHECKLIST], error: null }),
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

describe("resumoDasRespostas", () => {
  it("o Nao de pergunta Sim/Nao nao e nao conformidade, e nem entra na nota", () => {
    expect(resumoDasRespostas(CHECKLIST.checklist_respostas)).toEqual({ naoConformidades: 1, nota: 50 });
  });
});

describe("processarFilaDeEmailsDeChecklist", () => {
  it("envia ao superior com o link do Historico e chave de idempotencia, e marca ENVIADO", async () => {
    enviar.mockResolvedValue("re_9");
    const { admin, rpc, updates } = bancoFalso([{ id: 4, checklist_id: 31, destinatario: "chefe@x.test" }]);

    const resultado = await processarFilaDeEmailsDeChecklist(admin, "https://portal.test", "req");

    expect(resultado).toEqual({ enviados: 1, falhas: 0 });
    expect(rpc).toHaveBeenCalledWith("reservar_emails_de_checklist", { p_limite: 20, p_somente: undefined });
    const mensagem = enviar.mock.calls[0][0];
    expect(mensagem).toMatchObject({ para: "chefe@x.test", chave: "checklist-email-4" });
    expect(mensagem.assunto).toBe("Checklist enviado - Portaria - Posto Central - Ana Souza");
    expect(mensagem.texto).toContain("Situação: 1 não conformidade");
    expect(mensagem.texto).toContain("https://portal.test/dashboard/checklistlab/historico-de-checklist/31");
    expect(updates).toEqual([{ id: 4, dados: expect.objectContaining({ status: "ENVIADO", id_externo: "re_9" }) }]);
  });

  it("falha na terceira tentativa vira FALHOU", async () => {
    enviar.mockRejectedValue(new Error("recusado"));
    const { admin, updates } = bancoFalso([{ id: 4, checklist_id: 31, destinatario: "chefe@x.test" }], 3);

    expect(await processarFilaDeEmailsDeChecklist(admin, "https://portal.test", "req")).toEqual({
      enviados: 0,
      falhas: 1,
    });
    expect(updates[0].dados).toMatchObject({ status: "FALHOU", erro: "recusado" });
  });

  it("modo de teste sem destinatario liberado nao reserva nada", async () => {
    configuracao.mockReturnValue({ remetente: "Teste <t@x>", somente: [] });
    const { admin, rpc } = bancoFalso([]);

    expect(await processarFilaDeEmailsDeChecklist(admin, "https://portal.test", "req")).toEqual({
      enviados: 0,
      falhas: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
