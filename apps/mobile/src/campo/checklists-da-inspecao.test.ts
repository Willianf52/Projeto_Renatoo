import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/agendados-e-respondidos", () => ({ lerAgendamentos: async () => ({ ok: true, lista: [] }) }));
vi.mock("./rascunho", () => ({ lerRascunho: async () => null }));

const { montarItens, rascunhoTemConteudo, tipoDoRascunho } = await import("./checklists-da-inspecao");

const vazio = { motivo: "", respostas: {}, fotos: [], modeloId: null, fotosDePergunta: {}, observacoes: {} };

describe("checklists da inspecao", () => {
  it("rascunho vazio (gravado so por abrir a tela) nao conta", () => {
    expect(rascunhoTemConteudo(vazio)).toBe(false);
    expect(rascunhoTemConteudo(null)).toBe(false);
    expect(rascunhoTemConteudo({ ...vazio, respostas: { 1: "CONFORME" as never } })).toBe(true);
  });

  it("o tipo do rascunho: so motivo e visita corretiva; com respostas e checklist", () => {
    expect(tipoDoRascunho({ ...vazio, motivo: "Troca de lampada" })).toBe("CORRETIVA");
    expect(tipoDoRascunho({ ...vazio, modeloId: 3, respostas: { 1: "CONFORME" as never } })).toBe("CONSULTORIA");
  });

  it("rascunho, finalizados e agendados de hoje ainda nao feitos, nessa ordem", () => {
    const itens = montarItens({
      rascunho: { ...vazio, motivo: "Vazamento" },
      enviados: [{ id: 7, numeroAno: "00007/2026", modelo: "Padrão", hora: "09:10" }],
      agendados: [
        { chave: "a", modelo: "Limpeza", agenda: "Semanal", finalizado: false },
        { chave: "b", modelo: "Extintores", agenda: "Mensal", finalizado: true },
      ],
    });
    expect(itens.map((i) => [i.situacao, i.titulo])).toEqual([
      ["RASCUNHO", "Visita (motivo, foto e assinatura)"],
      ["FINALIZADO", "Padrão"],
      ["AGENDADO", "Limpeza"],
    ]);
    expect(itens[0].tipo).toBe("CORRETIVA");
  });
});
