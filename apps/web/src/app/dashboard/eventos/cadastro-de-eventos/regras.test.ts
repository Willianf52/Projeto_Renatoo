import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { deMinutos, formatarMinutos, lerDuracao, paraMinutos } = await import("./regras");
const { planejarImportacao } = await import("./importacao");
const { filtrarEventos, montarEventos, paraLinhaDeExportacao } = await import("./queries");

describe("prazos", () => {
  it("guarda em minutos e mostra na maior unidade exata", () => {
    expect(paraMinutos("2", "hour", "Tempo")).toEqual({ ok: true, minutos: 120 });
    expect(deMinutos(120)).toEqual({ quantidade: "2", unidade: "hour" });
    expect(deMinutos(90)).toEqual({ quantidade: "90", unidade: "minute" });
    expect(formatarMinutos(1440)).toBe("1 dia");
    expect(formatarMinutos(null)).toBe("");
  });

  it("vazio e zero sao sem prazo; texto e mais de um ano, recusados", () => {
    expect(paraMinutos("", "hour", "Tempo")).toEqual({ ok: true, minutos: null });
    expect(paraMinutos("0", "day", "Tempo")).toEqual({ ok: true, minutos: null });
    expect(paraMinutos("dois", "hour", "Tempo").ok).toBe(false);
    expect(paraMinutos("366", "day", "Tempo").ok).toBe(false);
  });

  it("le de volta o que a exportacao escreve", () => {
    for (const minutos of [30, 120, 1440, 90]) {
      expect(lerDuracao(formatarMinutos(minutos))).toEqual({ ok: true, minutos });
    }
    expect(lerDuracao("45")).toEqual({ ok: true, minutos: 45 });
    expect(lerDuracao("")).toEqual({ ok: true, minutos: null });
    expect(lerDuracao("duas horas").ok).toBe(false);
  });
});

describe("planejarImportacao", () => {
  const existentes = [
    { id: 1, nome: "PORTARIA", superiorId: null },
    { id: 2, nome: "Ronda noturna", superiorId: 1 },
  ];
  const cabecalho = ["ID", "Nome", "Descrição", "Superior", "Sites", "E-mails", "Tempo para Atendimento", "Bloqueio de Repetição", "Status"];

  it("cria os novos, pula os que existem (sem acento nem maiuscula) e liga ao superior cadastrado", () => {
    const plano = planejarImportacao(
      [
        cabecalho,
        ["", "Portão aberto", "", "portaria", "Qualquer", "A@x.com; b@y.com", "2 horas", "", ""],
        ["9", "Portaria", "", "", "", "", "", "", "Ativo"],
        ["", "Portão aberto", "", "", "", "", "", "", ""],
      ],
      existentes,
    );
    expect(plano.ok && plano.novos).toEqual([
      {
        nome: "Portão aberto",
        descricao: null,
        superior_id: 1,
        tempo_atendimento_minutos: 120,
        bloqueio_repeticao_minutos: null,
        ativo: true,
        emails: ["a@x.com", "b@y.com"],
      },
    ]);
    expect(plano.ok && plano.pulados.map((p) => p.motivo)).toEqual([
      "já existe um evento com esse nome",
      "repetido no próprio arquivo",
    ]);
  });

  it("recusa superior que nao existe ou que ja e subtipo, e status ou prazo invalidos", () => {
    const plano = planejarImportacao(
      [
        cabecalho,
        ["", "A", "", "Inexistente", "", "", "", "", ""],
        ["", "B", "", "Ronda noturna", "", "", "", "", ""],
        ["", "C", "", "", "", "", "", "", "Talvez"],
        ["", "D", "", "", "", "", "duas horas", "", ""],
        ["", "E", "", "", "", "nao-e-email", "", "", ""],
      ],
      existentes,
    );
    expect(plano.ok && plano.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5, 6]);
    expect(plano.ok && plano.novos).toEqual([]);
  });

  it("sem a coluna Nome, recusa o arquivo inteiro", () => {
    expect(planejarImportacao([["Descrição"], ["x"]], existentes).ok).toBe(false);
  });
});

describe("lista", () => {
  const dados = {
    eventos: [
      { id: 1, nome: "Portaria", descricao: "Entrada", superior_id: null, tempo_atendimento_minutos: 60, bloqueio_repeticao_minutos: null, ativo: true },
      { id: 2, nome: "Portão", descricao: null, superior_id: 1, tempo_atendimento_minutos: null, bloqueio_repeticao_minutos: 30, ativo: false },
    ],
    vinculos: [{ evento_id: 1, site_id: 7 }],
    notificacoes: [{ evento_id: 1, emails: ["a@x.com"] }],
    sites: [{ id: 7, nome: "Posto", ativo: true, grupos_sites: { nome: "Grupo" } }],
  };

  it("junta superior, sites e e-mails, e exporta no formato do Importar", () => {
    const [portao, portaria] = montarEventos(dados);
    expect(portao.superior).toBe("Portaria");
    expect(paraLinhaDeExportacao(portaria)).toEqual([
      "1",
      "Portaria",
      "Entrada",
      "",
      "Grupo - Posto",
      "a@x.com",
      "1 hora",
      "",
      "Ativo",
    ]);
  });

  it("filtra por situacao e por nome, descricao ou codigo", () => {
    const eventos = montarEventos(dados);
    expect(filtrarEventos(eventos, { situacao: "ativos" }).map((e) => e.id)).toEqual([1]);
    expect(filtrarEventos(eventos, { situacao: "todos", busca: "2" }).map((e) => e.id)).toEqual([2]);
    expect(filtrarEventos(eventos, { situacao: "todos", busca: "entrada" }).map((e) => e.id)).toEqual([1]);
  });
});
