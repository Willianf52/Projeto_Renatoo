import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const {
  descricaoAutomatica,
  extrairFiltros,
  idsPelaSituacao,
  montarResumo,
  ordenarAnalises,
  periodoPadrao,
  rotuloDaResposta,
  situacaoPelosAndamentos,
  tempoEmAberto,
} =
  await import("./queries");

const AGORA = new Date("2026-10-05T12:00:00Z");

describe("periodoPadrao", () => {
  it("os ultimos 60 dias, no horario de Brasilia", () => {
    expect(periodoPadrao(AGORA)).toEqual({ dataInicial: "2026-08-06", dataFinal: "2026-10-05" });
  });

  it("as 22h de Brasilia ainda e o mesmo dia", () => {
    expect(periodoPadrao(new Date("2026-10-06T01:00:00Z")).dataFinal).toBe("2026-10-05");
  });
});

describe("extrairFiltros", () => {
  it("sem nada na URL, abre nos ultimos 60 dias e na pagina 1", () => {
    expect(extrairFiltros({}, AGORA)).toMatchObject({ dataInicial: "2026-08-06", dataFinal: "2026-10-05", pagina: 1 });
  });

  it("descarta valor torto em vez de mandar para a consulta", () => {
    const f = extrairFiltros(
      { status: "QUALQUER", numero: "12a", ano: "26", sites: "abc", pagina: "-3", data_inicial: "2026-13-40" },
      AGORA,
    );
    expect(f).toMatchObject({ status: undefined, numero: undefined, ano: undefined, sites: undefined, pagina: 1 });
    expect(f.dataInicial).toBe("2026-08-06");
  });

  it("aceita os valores validos", () => {
    expect(
      extrairFiltros({ status: "AGUARDANDO", numero: "650", ano: "2026", sites: "12", busca: "  senha  ", pagina: "2" }, AGORA),
    ).toMatchObject({ status: "AGUARDANDO", numero: "650", ano: "2026", sites: "12", busca: "senha", pagina: 2 });
  });
});

describe("tempoEmAberto", () => {
  it("dias, horas e minutos desde a abertura", () => {
    expect(tempoEmAberto("2026-08-31T11:28:00Z", AGORA)).toEqual({ dias: 35, horas: 0, minutos: 32 });
  });

  it("relogio adiantado no aparelho nao vira tempo negativo", () => {
    expect(tempoEmAberto("2026-10-05T13:00:00Z", AGORA)).toEqual({ dias: 0, horas: 0, minutos: 0 });
  });
});

describe("descricaoAutomatica", () => {
  it("o texto do sistema de referencia, com a observacao quando houver", () => {
    expect(
      descricaoAutomatica({ checklistId: 30, pergunta: "Duvidas com o RH", resposta: "SIM", observacao: "Senha do ponto" }),
    ).toEqual([
      "Evento gerado automaticamente pelo Checklist nº 30",
      "Pergunta: Duvidas com o RH",
      "Resposta: Sim",
      "Observações: Senha do ponto",
    ]);
    expect(descricaoAutomatica({ checklistId: 1, pergunta: "P", resposta: "NAO", observacao: null })).toHaveLength(3);
    expect(rotuloDaResposta("NAO")).toBe("Não conforme");
  });

  it("ocorrencia registrada a mao (0072): sem checklist, so a observacao", () => {
    expect(descricaoAutomatica({ checklistId: null, pergunta: null, resposta: null, observacao: "Portão aberto" })).toEqual([
      "Evento registrado manualmente no portal",
      "Observações: Portão aberto",
    ]);
  });
});

describe("montarResumo", () => {
  it("conta por status na ordem do sistema de referencia, so os que aparecem", () => {
    expect(montarResumo([{ status: "EM_ANALISE" }, { status: "AGUARDANDO" }, { status: "AGUARDANDO" }])).toEqual([
      { status: "AGUARDANDO", quantidade: 2 },
      { status: "EM_ANALISE", quantidade: 1 },
    ]);
  });
});

describe("filtros novos do Painel (paridade de 03/11)", () => {
  it("le QR-Code, Checklist, andamentos, grupos e a visao", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    expect(
      extrairFiltros(
        {
          qrcode: "  PC-01 ",
          checklist: "7",
          tipo_analise: "2",
          remetente: uuid,
          responsavel: uuid,
          grupo_abertura: "3",
          grupo_remetente: "4",
          grupo_responsavel: "5",
          visao: "quadro",
        },
        AGORA,
      ),
    ).toMatchObject({
      qrcode: "PC-01",
      checklist: "7",
      tipoAnalise: "2",
      remetente: uuid,
      responsavel: uuid,
      grupoAbertura: "3",
      grupoRemetente: "4",
      grupoResponsavel: "5",
      visao: "quadro",
    });
  });

  it("descarta valor torto e abre na Lista", () => {
    expect(
      extrairFiltros({ checklist: "x", remetente: "nao-e-uuid", grupo_abertura: "-1", visao: "kanban" }, AGORA),
    ).toMatchObject({ checklist: undefined, remetente: undefined, grupoAbertura: undefined, visao: "lista" });
  });
});

describe("situacaoPelosAndamentos", () => {
  const A = "aaaaaaaa-0000-4000-8000-000000000001";
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  const C = "cccccccc-0000-4000-8000-000000000003";

  it("remetente e tipo do ultimo andamento; responsavel do ultimo que indicou alguem", () => {
    const situacao = situacaoPelosAndamentos([
      // fora de ordem de proposito: a funcao ordena por data e id
      { id: 3, ocorrencia_id: 10, criado_em: "2026-11-02T12:00:00Z", autor_id: C, responsavel_id: null, tipo_analise_id: 9 },
      { id: 1, ocorrencia_id: 10, criado_em: "2026-11-01T12:00:00Z", autor_id: A, responsavel_id: B, tipo_analise_id: 8 },
      { id: 2, ocorrencia_id: 11, criado_em: "2026-11-01T13:00:00Z", autor_id: B, responsavel_id: null, tipo_analise_id: 8 },
    ]);
    expect(situacao.get(10)).toEqual({ remetente: C, responsavel: B, tipoAnalise: 9 });
    expect(situacao.get(11)).toEqual({ remetente: B, responsavel: null, tipoAnalise: 8 });
  });

  it("idsPelaSituacao cruza filtros e grupos", () => {
    const situacao = new Map([
      [10, { remetente: C, responsavel: B, tipoAnalise: 9 }],
      [11, { remetente: B, responsavel: null, tipoAnalise: 8 }],
    ]);
    expect(idsPelaSituacao(situacao, { tipoAnalise: "8" }, {})).toEqual([11]);
    expect(idsPelaSituacao(situacao, { responsavel: B }, {})).toEqual([10]);
    expect(idsPelaSituacao(situacao, {}, { remetente: new Set([B, C]) })).toEqual([10, 11]);
    // sem responsavel nao passa no filtro de grupo do responsavel
    expect(idsPelaSituacao(situacao, {}, { responsavel: new Set([B]) })).toEqual([10]);
  });
});

describe("ordenarAnalises", () => {
  it("na ordem da lista e, dentro de cada evento, na ordem em que aconteceram", () => {
    const linhas = [{ id: 20 }, { id: 10 }];
    const andamentos = [
      { id: 1, ocorrencia_id: 10, criado_em: "2026-11-01T10:00:00Z" },
      { id: 4, ocorrencia_id: 20, criado_em: "2026-11-03T10:00:00Z" },
      { id: 2, ocorrencia_id: 20, criado_em: "2026-11-02T10:00:00Z" },
      { id: 9, ocorrencia_id: 99, criado_em: "2026-11-02T10:00:00Z" },
    ];
    expect(ordenarAnalises(linhas, andamentos).map((a) => a.id)).toEqual([2, 4, 1]);
  });
});
