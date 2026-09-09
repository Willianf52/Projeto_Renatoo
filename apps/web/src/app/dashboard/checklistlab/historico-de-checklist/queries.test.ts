import { describe, expect, it } from "vitest";
import {
  aplicarFiltrosDerivados,
  estaConcluido,
  extrairFiltros,
  idValido,
  montarLinha,
  montarSelect,
  ordenarRespostas,
  rotuloDaResposta,
  textoDaConclusao,
  textoDaSituacao,
  toTableRow,
  type ChecklistBruto,
  type Filtros,
} from "./queries";

const SEM_FILTROS: Filtros = { campoData: "envio", ordem: "recentes" };

function bruto(
  id: number,
  tipo: "CONSULTORIA" | "CORRETIVA",
  respostas: { resposta: string; observacao?: string | null }[],
  extra: Partial<ChecklistBruto> = {},
): ChecklistBruto {
  return {
    id,
    tipo,
    motivo: tipo === "CORRETIVA" ? "Portão danificado" : null,
    criado_em: "2026-09-08T14:30:00-03:00",
    visitas: {
      numero_coleta: `${id}/2026`,
      criado_em: "2026-09-08T09:00:00-03:00",
      motivos_visita: { nome: "Visita programada" },
      profiles: { nome_completo: "Ana Souza" },
      sites: { nome: "ACE Limpeza" },
    },
    checklist_respostas: respostas.map((r) => ({ resposta: r.resposta, observacao: r.observacao ?? null })),
    ...extra,
  };
}

/** Atalho: monta a linha derivada com N perguntas ativas no cadastro. */
function linha(b: ChecklistBruto, totalPerguntas = 3) {
  return montarLinha(b, totalPerguntas);
}

describe("extrairFiltros", () => {
  it("le todos os campos da querystring", () => {
    expect(
      extrairFiltros({
        campo_data: "visita",
        data_inicial: "2026-09-01",
        data_final: "2026-09-30",
        numero_ano: "12/2026",
        checklist: "CORRETIVA",
        ordem: "antigos",
        site: "3",
        grupo_site: "4",
        grupo_usuario: "5",
        responsavel: "abc",
        situacao: "nao_conforme",
        conclusao: "incompleto",
        busca: "ace",
        busca_respostas: "extintor",
      }),
    ).toEqual({
      campoData: "visita",
      dataInicial: "2026-09-01",
      dataFinal: "2026-09-30",
      numeroAno: "12/2026",
      checklist: "CORRETIVA",
      ordem: "antigos",
      site: "3",
      grupoSite: "4",
      grupoUsuario: "5",
      responsavel: "abc",
      situacao: "nao_conforme",
      conclusao: "incompleto",
      busca: "ace",
      buscaRespostas: "extintor",
    });
  });

  it("cai no padrao de campo de data e ordem quando o valor falta ou e desconhecido", () => {
    expect(extrairFiltros({}).campoData).toBe("envio");
    expect(extrairFiltros({}).ordem).toBe("recentes");
    expect(extrairFiltros({ campo_data: "qualquer", ordem: "qualquer" })).toMatchObject({
      campoData: "envio",
      ordem: "recentes",
    });
  });

  it("ignora `status`, que a tela mostra mas o schema nao tem", () => {
    expect(Object.keys(extrairFiltros({ status: "1" }))).not.toContain("status");
  });
});

describe("montarSelect", () => {
  it("mantem visitas e sites como inner -- as duas FKs sao NOT NULL", () => {
    expect(montarSelect(false)).toContain("visitas!inner");
    expect(montarSelect(false)).toContain("sites!inner");
  });

  it("so amarra profiles quando o filtro de grupo de usuarios precisa", () => {
    expect(montarSelect(false)).not.toContain("profiles!inner");
    expect(montarSelect(false)).not.toContain("grupos_usuarios_membros");

    expect(montarSelect(true)).toContain("profiles!inner");
    expect(montarSelect(true)).toContain("grupos_usuarios_membros!inner");
  });
});

describe("montarLinha", () => {
  it("calcula a nota como percentual de SIM entre SIM e NAO, ignorando NA", () => {
    const l = linha(bruto(1, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "NAO" }, { resposta: "NA" }]));
    expect(l.nota).toBe(50);
    expect(l.respondidas).toBe(3);
    expect(l.naoConformidades).toBe(1);
  });

  it("deixa a nota nula quando nao ha SIM nem NAO", () => {
    expect(linha(bruto(1, "CONSULTORIA", [{ resposta: "NA" }])).nota).toBeNull();
    expect(linha(bruto(2, "CORRETIVA", [])).nota).toBeNull();
  });

  it("usa o motivo do checklist na corretiva e o da visita na consultoria", () => {
    expect(linha(bruto(1, "CORRETIVA", [])).motivo).toBe("Portão danificado");
    expect(linha(bruto(2, "CONSULTORIA", [])).motivo).toBe("Visita programada");
  });
});

describe("estaConcluido / textoDaConclusao", () => {
  it("considera a corretiva concluida -- ela nao responde questionario", () => {
    const l = linha(bruto(1, "CORRETIVA", []));
    expect(estaConcluido(l)).toBe(true);
    expect(textoDaConclusao(l)).toBe("Concluído");
  });

  it("compara respondidas com as perguntas ativas na consultoria", () => {
    const completo = linha(bruto(1, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "SIM" }, { resposta: "NA" }]));
    expect(estaConcluido(completo)).toBe(true);
    expect(textoDaConclusao(completo)).toBe("Concluído (3/3)");

    const parcial = linha(bruto(2, "CONSULTORIA", [{ resposta: "SIM" }]));
    expect(estaConcluido(parcial)).toBe(false);
    expect(textoDaConclusao(parcial)).toBe("Incompleto (1/3)");
  });
});

describe("textoDaSituacao", () => {
  it("conta as nao conformidades e concorda em numero", () => {
    expect(textoDaSituacao(linha(bruto(1, "CONSULTORIA", [{ resposta: "NAO" }])))).toBe("1 não conformidade");
    expect(
      textoDaSituacao(linha(bruto(2, "CONSULTORIA", [{ resposta: "NAO" }, { resposta: "NAO" }]))),
    ).toBe("2 não conformidades");
  });

  it("nao enquadra a corretiva como conforme nem como nao conforme", () => {
    expect(textoDaSituacao(linha(bruto(1, "CORRETIVA", [])))).toBe("Corretiva");
  });

  it("separa consultoria conforme de consultoria sem resposta nenhuma", () => {
    expect(textoDaSituacao(linha(bruto(1, "CONSULTORIA", [{ resposta: "SIM" }])))).toBe("Conforme");
    expect(textoDaSituacao(linha(bruto(2, "CONSULTORIA", [])))).toBe("Sem respostas");
  });
});

describe("aplicarFiltrosDerivados", () => {
  const brutos = [
    bruto(1, "CONSULTORIA", [{ resposta: "NAO", observacao: "Extintor vencido" }, { resposta: "SIM" }]),
    bruto(2, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "SIM" }, { resposta: "SIM" }]),
    bruto(3, "CORRETIVA", []),
  ];
  const linhas = brutos.map((b) => linha(b));

  const ids = (filtros: Filtros) =>
    aplicarFiltrosDerivados(linhas, brutos, filtros).map((l) => l.id);

  it("devolve tudo sem filtro derivado nenhum", () => {
    expect(ids(SEM_FILTROS)).toEqual([1, 2, 3]);
  });

  it("filtra por situacao e deixa a corretiva de fora das duas opcoes", () => {
    expect(ids({ ...SEM_FILTROS, situacao: "nao_conforme" })).toEqual([1]);
    expect(ids({ ...SEM_FILTROS, situacao: "conforme" })).toEqual([2]);
  });

  it("filtra por conclusao contando a corretiva como concluida", () => {
    expect(ids({ ...SEM_FILTROS, conclusao: "incompleto" })).toEqual([1]);
    expect(ids({ ...SEM_FILTROS, conclusao: "concluido" })).toEqual([2, 3]);
  });

  it("busca livre varre numero, site, responsavel, motivo e tipo, sem diferenciar caixa", () => {
    expect(ids({ ...SEM_FILTROS, busca: "ACE" })).toEqual([1, 2, 3]);
    expect(ids({ ...SEM_FILTROS, busca: "portão" })).toEqual([3]);
    expect(ids({ ...SEM_FILTROS, busca: "3/2026" })).toEqual([3]);
    expect(ids({ ...SEM_FILTROS, busca: "nao existe" })).toEqual([]);
  });

  it("busca de respostas olha as observacoes e o motivo da corretiva", () => {
    expect(ids({ ...SEM_FILTROS, buscaRespostas: "extintor" })).toEqual([1]);
    expect(ids({ ...SEM_FILTROS, buscaRespostas: "portão" })).toEqual([3]);
  });

  it("combina os filtros derivados entre si", () => {
    expect(ids({ ...SEM_FILTROS, situacao: "nao_conforme", conclusao: "concluido" })).toEqual([]);
  });
});

describe("toTableRow", () => {
  it("devolve uma coluna por cabecalho, com a nota em percentual", () => {
    const colunas = toTableRow(linha(bruto(7, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "NAO" }])));
    expect(colunas).toHaveLength(10);
    expect(colunas[0]).toBe("7");
    expect(colunas[1]).toBe("7/2026");
    expect(colunas[2]).toBe("Consultoria");
    expect(colunas[9]).toBe("50%");
  });

  it("deixa a nota vazia quando nao ha como calcular -- a tabela ja vira travessao", () => {
    expect(toTableRow(linha(bruto(8, "CORRETIVA", [])))[9]).toBe("");
  });
});

describe("idValido", () => {
  it("aceita inteiro positivo e recusa o resto", () => {
    expect(idValido("7")).toBe(7);
    expect(idValido("abc")).toBeNull();
    expect(idValido("0")).toBeNull();
    expect(idValido("-3")).toBeNull();
    expect(idValido("1.5")).toBeNull();
    expect(idValido("")).toBeNull();
  });
});

describe("rotuloDaResposta", () => {
  it("traduz os tres valores do check do banco", () => {
    expect(rotuloDaResposta("SIM")).toBe("Sim");
    expect(rotuloDaResposta("NAO")).toBe("Não");
    expect(rotuloDaResposta("NA")).toBe("Não se aplica");
  });

  it("devolve o valor cru quando nao conhece -- nao vira celula vazia", () => {
    expect(rotuloDaResposta("TALVEZ")).toBe("TALVEZ");
  });
});

describe("ordenarRespostas", () => {
  const resposta = (perguntaId: number, ordem: number | null, texto = `Pergunta ${perguntaId}`) => ({
    resposta: "SIM",
    observacao: null,
    pergunta_id: perguntaId,
    perguntas_checklist: ordem === null ? null : { ordem, texto },
  });

  it("ordena pela ordem da pergunta, nao pela ordem que o PostgREST devolveu", () => {
    const ordenadas = ordenarRespostas([resposta(30, 3), resposta(10, 1), resposta(20, 2)]);
    expect(ordenadas.map((r) => r.ordem)).toEqual([1, 2, 3]);
    expect(ordenadas.map((r) => r.perguntaId)).toEqual([10, 20, 30]);
  });

  it("joga resposta sem pergunta para o fim, sem quebrar a ordenacao", () => {
    const ordenadas = ordenarRespostas([resposta(99, null), resposta(10, 1)]);
    expect(ordenadas.map((r) => r.perguntaId)).toEqual([10, 99]);
    expect(ordenadas[1]).toMatchObject({ ordem: null, pergunta: "" });
  });

  it("ja traduz a resposta para o rotulo de tela", () => {
    const [primeira] = ordenarRespostas([
      { resposta: "NAO", observacao: "Extintor vencido", pergunta_id: 1, perguntas_checklist: { ordem: 1, texto: "Extintores em dia?" } },
    ]);
    expect(primeira.resposta).toBe("Não");
    expect(primeira.observacao).toBe("Extintor vencido");
    expect(primeira.pergunta).toBe("Extintores em dia?");
  });
});

/**
 * Os dois casos abaixo nasceram de uma revisao: sao defeitos encontrados
 * depois da tela pronta, e o teste vem junto para nao voltarem.
 */
describe("regressoes encontradas na revisao", () => {
  it("nao devolve como Conforme a consultoria que nao respondeu nada", () => {
    // A tabela rotula esta linha como "Sem respostas" (textoDaSituacao). O
    // filtro precisa concordar com o rotulo: quem escolhe "Conforme" espera
    // checklist respondido e sem nao conformidade, nao checklist vazio.
    const semRespostas = bruto(4, "CONSULTORIA", []);
    const linhas = [linha(semRespostas)];

    expect(textoDaSituacao(linhas[0])).toBe("Sem respostas");
    expect(
      aplicarFiltrosDerivados(linhas, [semRespostas], { ...SEM_FILTROS, situacao: "conforme" }),
    ).toEqual([]);
  });

  it("descarta data fora do formato yyyy-mm-dd em vez de repassar ao Postgres", () => {
    // `?data_inicial=abc` viraria o literal `abcT00:00:00-03:00` num `gte` de
    // timestamptz -- erro 22007 do Postgres subindo como 500 da tela. Mesma
    // guarda que `registro-de-rondas` faz com `mesValido`.
    expect(extrairFiltros({ data_inicial: "abc" }).dataInicial).toBeUndefined();
    expect(extrairFiltros({ data_final: "2026-13-01" }).dataFinal).toBeUndefined();
    expect(extrairFiltros({ data_inicial: "2026-09-09" }).dataInicial).toBe("2026-09-09");
  });
});
