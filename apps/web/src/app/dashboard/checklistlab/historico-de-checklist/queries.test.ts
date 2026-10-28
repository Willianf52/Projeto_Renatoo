import { describe, expect, it } from "vitest";
import {
  camposDoResumo,
  comPadroesDaTela,
  conclusaoDaLista,
  estaConcluido,
  extrairFiltros,
  filtrosParaOBanco,
  filtrosSemResultado,
  formatarDataHoraComSegundos,
  hojeNoFuso,
  idValido,
  interpretarNumeroAno,
  linhasDeRespostas,
  montarArvore,
  montarLinha,
  ordenarRespostas,
  paraLinhaDoHistorico,
  paramsDaUrl,
  querystringDe,
  rotuloDaResposta,
  textoDaConclusao,
  textoDaSituacao,
  toTableRow,
  totalDoModelo,
  type ChecklistBruto,
  type ChecklistDetalhe,
  type Filtros,
  type LinhaDoBanco,
  type RespostaParaExportar,
} from "./queries";

const SEM_FILTROS: Filtros = {
  campoData: "planejada",
  ordem: "recentes",
  modelos: [],
  sites: [],
  gruposSites: [],
  gruposUsuarios: [],
  responsaveis: [],
};

function bruto(
  id: number,
  tipo: "CONSULTORIA" | "CORRETIVA",
  respostas: { resposta: string; observacao?: string | null; tipo?: string }[],
  extra: Partial<ChecklistBruto> = {},
): ChecklistBruto {
  return {
    id,
    numero: id,
    ano: 2026,
    tipo,
    motivo: tipo === "CORRETIVA" ? "Portão danificado" : null,
    criado_em: "2026-09-08T14:30:00-03:00",
    modelo_id: tipo === "CONSULTORIA" ? 5 : null,
    modelos_checklist: tipo === "CONSULTORIA" ? { nome: "Portaria" } : null,
    visitas: {
      criado_em: "2026-09-08T09:00:00-03:00",
      motivos_visita: { nome: "Visita programada" },
      profiles: { nome_completo: "Ana Souza" },
      sites: { nome: "ACE Limpeza" },
    },
    checklist_respostas: respostas.map((r) => ({
      resposta: r.resposta,
      observacao: r.observacao ?? null,
      perguntas_checklist: { tipo_resposta: r.tipo ?? "CNA" },
    })),
    ...extra,
  };
}

/** Atalho: monta a linha derivada com N perguntas ativas no cadastro. */
function linha(b: ChecklistBruto, totalPerguntas = 3) {
  return montarLinha(b, totalPerguntas);
}

describe("extrairFiltros", () => {
  it("le todos os campos da querystring, com os de selecao multipla em lista", () => {
    expect(
      extrairFiltros({
        campo_data: "termino",
        data_inicial: "2026-09-01",
        data_final: "2026-09-30",
        numero_ano: "12/2026",
        modelo: ["9", "10"],
        origem: "avulso",
        ordem: "antigos",
        site: ["3", "8"],
        grupo_site: "4",
        grupo_usuario: "5",
        responsavel: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
        situacao: "no_prazo",
        conclusao: "incompleto",
        atividade: "",
        nota_minima: "70",
        nota_maxima: "99,5",
        status: "ativos",
        busca: "ace",
        busca_respostas: "extintor",
      }),
    ).toEqual({
      campoData: "termino",
      dataInicial: "2026-09-01",
      dataFinal: "2026-09-30",
      numeroAno: "12/2026",
      modelos: ["9", "10"],
      origem: "avulso",
      ordem: "antigos",
      sites: ["3", "8"],
      gruposSites: ["4"],
      gruposUsuarios: ["5"],
      responsaveis: ["e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3"],
      situacao: "no_prazo",
      conclusao: "incompleto",
      atividade: undefined,
      notaMinima: 70,
      notaMaxima: 99.5,
      status: "ativos",
      busca: "ace",
      buscaRespostas: "extintor",
    });
  });

  it("cai na Data Planejada e na ordem recente quando o valor falta ou e desconhecido", () => {
    expect(extrairFiltros({}).campoData).toBe("planejada");
    expect(extrairFiltros({}).ordem).toBe("recentes");
    expect(extrairFiltros({ campo_data: "qualquer", ordem: "qualquer" })).toMatchObject({
      campoData: "planejada",
      ordem: "recentes",
    });
  });

  it("link salvo antes de 18/10 (envio/visita) abre no mesmo recorte", () => {
    expect(extrairFiltros({ campo_data: "envio" }).campoData).toBe("finalizacao");
    expect(extrairFiltros({ campo_data: "visita" }).campoData).toBe("inicio");
  });

  it("descarta, valor a valor, id ou uuid fora do tipo em vez de derrubar a consulta", () => {
    // Achado ao vivo em 25/09: `?site=abc` e `?responsavel=nao-uuid` faziam o
    // Postgres recusar a consulta e a tela inteira cair.
    expect(
      extrairFiltros({
        site: ["abc", "12"],
        grupo_site: "1e3",
        grupo_usuario: "99999999999999999999",
        responsavel: ["nao-uuid", "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3"],
      }),
    ).toMatchObject({
      sites: ["12"],
      gruposSites: [],
      gruposUsuarios: [],
      responsaveis: ["e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3"],
    });
  });

  it("nota que nao e numero e ignorada", () => {
    expect(extrairFiltros({ nota_minima: "abc", nota_maxima: " " })).toMatchObject({
      notaMinima: undefined,
      notaMaxima: undefined,
    });
  });
});

describe("parametros da URL", () => {
  it("querystringDe guarda todos os valores dos filtros multiplos e pula os pedidos", () => {
    expect(querystringDe({ site: ["1", "2"], pagina: "3", busca: "ace", vazio: "" }, ["pagina"])).toBe(
      "site=1&site=2&busca=ace",
    );
  });

  it("paramsDaUrl devolve lista so para o parametro repetido", () => {
    expect(paramsDaUrl(new URLSearchParams("site=1&site=2&busca=ace"))).toEqual({
      site: ["1", "2"],
      busca: "ace",
    });
  });

  it("a primeira abertura vem com o periodo de hoje, como no sistema antigo", () => {
    expect(comPadroesDaTela({}, "2026-10-18")).toEqual({ data_inicial: "2026-10-18", data_final: "2026-10-18" });
    expect(comPadroesDaTela({ pagina: "2" }, "2026-10-18")).toMatchObject({ data_inicial: "2026-10-18" });
  });

  it("com qualquer filtro na URL, inclusive datas limpas de proposito, nada e preenchido", () => {
    expect(comPadroesDaTela({ data_inicial: "" }, "2026-10-18")).toEqual({ data_inicial: "" });
    expect(comPadroesDaTela({ site: "3" }, "2026-10-18")).toEqual({ site: "3" });
  });

  it("hojeNoFuso usa Sao Paulo, nao UTC", () => {
    // 01h30 UTC de 19/10 ainda e 18/10 em Sao Paulo.
    expect(hojeNoFuso(new Date("2026-10-19T01:30:00Z"))).toBe("2026-10-18");
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

  it("o Nao de uma pergunta Sim/Nao nao e nao conformidade nem pesa na nota (0061)", () => {
    const l = linha(
      bruto(1, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "NAO", tipo: "SN" }, { resposta: "SIM", tipo: "SN" }]),
    );
    expect(l.naoConformidades).toBe(0);
    expect(l.nota).toBe(100);
    expect(textoDaSituacao(l)).toBe("Conforme");
  });

  it("numero com cinco digitos, como no sistema antigo", () => {
    expect(linha(bruto(18, "CONSULTORIA", [])).numeroAno).toBe("00018/2026");
  });

  it("traz o nome do modelo, vazio na corretiva", () => {
    expect(linha(bruto(1, "CONSULTORIA", [])).modelo).toBe("Portaria");
    expect(linha(bruto(2, "CORRETIVA", [])).modelo).toBe("");
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

describe("filtrosSemResultado", () => {
  // Os filtros da referencia que nao acham nada no sistema novo: a tela nem
  // chama o banco.
  it("Situacao diferente de No prazo, Conclusao que depende de agenda, Origem Agenda, Atividade e Inativos", () => {
    expect(filtrosSemResultado(SEM_FILTROS)).toBe(false);
    expect(filtrosSemResultado({ ...SEM_FILTROS, situacao: "no_prazo" })).toBe(false);
    expect(filtrosSemResultado({ ...SEM_FILTROS, situacao: "atrasado" })).toBe(true);
    expect(filtrosSemResultado({ ...SEM_FILTROS, conclusao: "finalizado" })).toBe(false);
    expect(filtrosSemResultado({ ...SEM_FILTROS, conclusao: "incompleto" })).toBe(false);
    expect(filtrosSemResultado({ ...SEM_FILTROS, conclusao: "aprovado" })).toBe(true);
    expect(filtrosSemResultado({ ...SEM_FILTROS, origem: "agenda" })).toBe(true);
    expect(filtrosSemResultado({ ...SEM_FILTROS, atividade: "1" })).toBe(true);
    expect(filtrosSemResultado({ ...SEM_FILTROS, status: "inativos" })).toBe(true);
  });

  it("Numero/Ano que nao e numero nao acha nada", () => {
    expect(filtrosSemResultado({ ...SEM_FILTROS, numeroAno: "35/2026" })).toBe(false);
    expect(filtrosSemResultado({ ...SEM_FILTROS, numeroAno: "abc" })).toBe(true);
  });
});

describe("filtrosParaOBanco", () => {
  it("Planejada e Inicio recortam a visita; Termino e Finalizacao, o envio do checklist", () => {
    expect(filtrosParaOBanco({ ...SEM_FILTROS, campoData: "planejada" }).campo_data).toBe("visita");
    expect(filtrosParaOBanco({ ...SEM_FILTROS, campoData: "inicio" }).campo_data).toBe("visita");
    expect(filtrosParaOBanco({ ...SEM_FILTROS, campoData: "termino" }).campo_data).toBe("checklist");
    expect(filtrosParaOBanco({ ...SEM_FILTROS, campoData: "finalizacao" }).campo_data).toBe("checklist");
  });

  it("datas viram instantes no fuso do projeto, com o fim exclusivo", () => {
    const filtros = filtrosParaOBanco({ ...SEM_FILTROS, dataInicial: "2026-10-01", dataFinal: "2026-10-28" });
    expect(filtros.inicio).toBe("2026-10-01T00:00:00-03:00");
    expect(new Date(String(filtros.fim)).toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("Numero/Ano separado em numero e ano; so o numero procura em qualquer ano", () => {
    expect(filtrosParaOBanco({ ...SEM_FILTROS, numeroAno: "35/2026" })).toMatchObject({ numero: 35, ano: 2026 });
    expect(filtrosParaOBanco({ ...SEM_FILTROS, numeroAno: "35" })).toMatchObject({ numero: 35, ano: null });
  });

  it("leva os filtros de lista, Conclusao, Nota, buscas e ordem com os nomes do banco", () => {
    expect(
      filtrosParaOBanco({
        ...SEM_FILTROS,
        modelos: ["5"],
        sites: ["7"],
        gruposSites: ["2"],
        gruposUsuarios: ["3"],
        responsaveis: ["e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3"],
        conclusao: "incompleto",
        notaMinima: 50,
        notaMaxima: 90,
        busca: "extintor",
        buscaRespostas: "vencido",
        ordem: "antigos",
      }),
    ).toMatchObject({
      modelos: ["5"],
      sites: ["7"],
      grupos_sites: ["2"],
      grupos_usuarios: ["3"],
      responsaveis: ["e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3"],
      conclusao: "incompleto",
      nota_minima: 50,
      nota_maxima: 90,
      busca: "extintor",
      busca_respostas: "vencido",
      ordem: "antigos",
    });
  });
});

describe("paraLinhaDoHistorico", () => {
  const doBanco = (extra: Partial<LinhaDoBanco> = {}): LinhaDoBanco => ({
    id: 36,
    numero: 19,
    ano: 2026,
    tipo: "CONSULTORIA",
    motivo: null,
    criado_em: "2026-10-21T13:05:00Z",
    modelo_id: 5,
    modelo_nome: "Cooperativa",
    inicio_em: "2026-10-21T12:50:00Z",
    funcionario_id: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
    responsavel: "Inspetor",
    site_id: 30,
    site_nome: "Agencia",
    caminho: "UP Serviços → Agencia",
    motivo_da_visita: "Visita programada",
    total_perguntas: 12,
    respondidas: 12,
    nao_conformidades: 1,
    nota: 91,
    ...extra,
  });

  it("as colunas que a tela mostra, com as derivadas vindas do banco", () => {
    const linha = paraLinhaDoHistorico(doBanco());
    expect(linha).toMatchObject({
      numeroAno: "00019/2026",
      checklist: "Consultoria",
      modelo: "Cooperativa",
      caminhoDoSite: "UP Serviços → Agencia",
      motivo: "Visita programada",
      respondidas: 12,
      totalPerguntas: 12,
      naoConformidades: 1,
      nota: 91,
    });
    expect(textoDaConclusao(linha)).toBe("Concluído (12/12)");
    expect(textoDaSituacao(linha)).toBe("1 não conformidade");
  });

  it("corretiva: o motivo digitado, sem modelo, sem nota, concluida", () => {
    const linha = paraLinhaDoHistorico(
      doBanco({ tipo: "CORRETIVA", motivo: "Portão danificado", modelo_id: null, modelo_nome: null, nota: null }),
    );
    expect(linha).toMatchObject({ checklist: "Corretiva", modelo: "", motivo: "Portão danificado", nota: null });
    expect(estaConcluido(linha)).toBe(true);
  });

  it("sem caminho, cai no nome do site", () => {
    expect(paraLinhaDoHistorico(doBanco({ caminho: null })).caminhoDoSite).toBe("Agencia");
  });
});

describe("toTableRow", () => {
  it("as colunas do sistema antigo, na mesma ordem", () => {
    const colunas = toTableRow(linha(bruto(7, "CONSULTORIA", [{ resposta: "SIM" }, { resposta: "NAO" }])));
    expect(colunas).toHaveLength(11);
    expect(colunas[0]).toBe("7");
    expect(colunas[1]).toBe("00007/2026");
    expect(colunas[2]).toBe("Portaria");
    expect(colunas[3].split("\n")).toEqual([
      "Planejada: 08/09/2026 09:00:00",
      "Início: 08/09/2026 09:00:00",
      "Término: 08/09/2026 14:30:00",
      "Finalização: 08/09/2026 14:30:00",
      "Integração: 08/09/2026 14:30:00",
    ]);
    expect(colunas[4]).toBe("Ana Souza");
    expect(colunas[5]).toBe("ACE Limpeza");
    expect(colunas[6]).toBe("-");
    expect(colunas[7]).toBe("No prazo");
    expect(colunas[8]).toBe("Incompleto");
    expect(colunas[9]).toBe("50");
    expect(colunas[10]).toBe("Ativo");
  });

  it("corretiva: tipo no lugar do modelo, nota vazia, Finalizado", () => {
    const colunas = toTableRow(linha(bruto(8, "CORRETIVA", [])));
    expect(colunas[2]).toBe("Corretiva");
    expect(colunas[8]).toBe("Finalizado");
    expect(colunas[9]).toBe("");
  });
});

describe("formatarDataHoraComSegundos / conclusaoDaLista", () => {
  it("dia, hora e segundos em Sao Paulo", () => {
    expect(formatarDataHoraComSegundos("2026-10-17T10:53:38Z")).toBe("17/10/2026 07:53:38");
    expect(formatarDataHoraComSegundos("nao e data")).toBe("");
  });

  it("Finalizado ou Incompleto", () => {
    expect(conclusaoDaLista(linha(bruto(1, "CONSULTORIA", [{ resposta: "SIM" }]), 1))).toBe("Finalizado");
    expect(conclusaoDaLista(linha(bruto(2, "CONSULTORIA", [{ resposta: "SIM" }]), 3))).toBe("Incompleto");
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
    // Estourava o bigint: `Number.isInteger(1e20)` e true. Achado ao vivo em 25/09.
    expect(idValido("99999999999999999999")).toBeNull();
  });
});

describe("totalDoModelo", () => {
  it("conta as perguntas do modelo respondido, e zero na corretiva", () => {
    const porModelo = new Map([
      [5, 12],
      [6, 30],
    ]);
    expect(totalDoModelo(porModelo, 5)).toBe(12);
    expect(totalDoModelo(porModelo, 7)).toBe(0);
    expect(totalDoModelo(porModelo, null)).toBe(0);
  });
});

describe("rotuloDaResposta", () => {
  it("le pela pergunta: Conforme numa de conformidade, Sim numa Sim/Nao", () => {
    expect(rotuloDaResposta("CNA", "SIM")).toBe("Conforme");
    expect(rotuloDaResposta("CNA", "NAO")).toBe("Não conforme");
    expect(rotuloDaResposta("CNA", "NA")).toBe("Não se aplica");
    expect(rotuloDaResposta("SN", "SIM")).toBe("Sim");
    expect(rotuloDaResposta("SN", "NAO")).toBe("Não");
  });

  it("devolve o valor cru quando nao conhece -- nao vira celula vazia", () => {
    expect(rotuloDaResposta("CNA", "TALVEZ")).toBe("TALVEZ");
  });
});

describe("ordenarRespostas", () => {
  const resposta = (perguntaId: number, ordem: number | null, texto = `Pergunta ${perguntaId}`) => ({
    resposta: "SIM",
    observacao: null,
    pergunta_id: perguntaId,
    perguntas_checklist: ordem === null ? null : { ordem, texto, tipo_resposta: "CNA" },
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
      {
        resposta: "NAO",
        observacao: "Extintor vencido",
        pergunta_id: 1,
        perguntas_checklist: { ordem: 1, texto: "Extintores em dia?", tipo_resposta: "CNA" },
      },
    ]);
    expect(primeira.resposta).toBe("Não conforme");
    expect(primeira.valor).toBe("NAO");
    expect(primeira.observacao).toBe("Extintor vencido");
    expect(primeira.pergunta).toBe("Extintores em dia?");
  });

  it("pendura em cada resposta as fotos da propria pergunta (0061)", () => {
    const ordenadas = ordenarRespostas(
      [resposta(10, 1), resposta(20, 2)],
      [
        { id: 1, criado_em: "2026-09-30T10:00:00Z", pergunta_id: 20 },
        { id: 2, criado_em: "2026-09-30T10:01:00Z", pergunta_id: null },
        { id: 3, criado_em: "2026-09-30T10:02:00Z", pergunta_id: 20 },
      ],
    );
    expect(ordenadas[0].fotos).toEqual([]);
    expect(ordenadas[1].fotos.map((foto) => foto.id)).toEqual([1, 3]);
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
    expect(conclusaoDaLista(linhas[0])).toBe("Incompleto");
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

describe("decisao pelo tipo cru, nao pelo rotulo de tela", () => {
  it("continua reconhecendo a corretiva se o rotulo da coluna mudar", () => {
    // O rotulo e texto de tela e pode ser renomeado a qualquer momento. Antes
    // as tres funcoes decidiam comparando com ele, entao um `checklist:
    // "Visita corretiva"` fazia os filtros pararem de reconhecer a corretiva
    // -- sem erro de compilacao e sem teste vermelho.
    const renomeada = { ...linha(bruto(1, "CORRETIVA", [])), checklist: "Visita corretiva" };

    expect(renomeada.tipo).toBe("CORRETIVA");
    expect(estaConcluido(renomeada)).toBe(true);
    expect(textoDaSituacao(renomeada)).toBe("Corretiva");
    expect(textoDaConclusao(renomeada)).toBe("Concluído");
  });
});

describe("linhasDeRespostas", () => {
  const resposta = (
    checklistId: number,
    ordem: number,
    valor: string,
    extra: Partial<RespostaParaExportar> = {},
  ): RespostaParaExportar => ({
    checklist_id: checklistId,
    resposta: valor,
    observacao: null,
    perguntas_checklist: { ordem, texto: `Pergunta ${ordem}`, tipo_resposta: "CNA" },
    ...extra,
  });

  it("uma linha por resposta, na ordem das perguntas, com o checklist repetido", () => {
    const consultoria = linha(bruto(7, "CONSULTORIA", []));
    const linhas = linhasDeRespostas(
      [consultoria],
      [resposta(7, 2, "NAO", { observacao: "Extintor vencido" }), resposta(7, 1, "SIM")],
    );

    expect(linhas).toHaveLength(2);
    expect(linhas[0].slice(0, 4)).toEqual(["7", "00007/2026", "Consultoria", "Portaria"]);
    expect(linhas[0].slice(5, 7)).toEqual(["Ana Souza", "ACE Limpeza"]);
    expect(linhas[0].slice(7)).toEqual(["1", "Pergunta 1", "Conforme", ""]);
    expect(linhas[1].slice(7)).toEqual(["2", "Pergunta 2", "Não conforme", "Extintor vencido"]);
  });

  it("o rotulo segue o tipo da pergunta: NAO numa Sim/Nao e 'Não', nao 'Não conforme'", () => {
    const linhas = linhasDeRespostas(
      [linha(bruto(7, "CONSULTORIA", []))],
      [resposta(7, 1, "NAO", { perguntas_checklist: { ordem: 1, texto: "Duvidas com o RH", tipo_resposta: "SN" } })],
    );

    expect(linhas[0][9]).toBe("Não");
  });

  it("segue a ordem da listagem, nao a das respostas", () => {
    const linhas = linhasDeRespostas(
      [linha(bruto(9, "CONSULTORIA", [])), linha(bruto(3, "CONSULTORIA", []))],
      [resposta(3, 1, "SIM"), resposta(9, 1, "SIM")],
    );

    expect(linhas.map((l) => l[0])).toEqual(["9", "3"]);
  });

  it("checklist sem resposta sai numa linha so; a corretiva leva o motivo na Observacao", () => {
    const linhas = linhasDeRespostas(
      [linha(bruto(4, "CONSULTORIA", [])), linha(bruto(5, "CORRETIVA", []))],
      [],
      new Map([[5, "Portão danificado"]]),
    );

    expect(linhas).toHaveLength(2);
    expect(linhas[0].slice(7)).toEqual(["", "", "", ""]);
    expect(linhas[1].slice(7)).toEqual(["", "", "", "Portão danificado"]);
  });
});

describe("camposDoResumo", () => {
  it("o mesmo cabecalho para a tela de detalhe e o PDF unificado", () => {
    const detalhe: ChecklistDetalhe = {
      linha: linha(bruto(1, "CONSULTORIA", [{ resposta: "SIM" }]), 1),
      visitaId: 10,
      registradoEm: "2026-09-08T09:00:00-03:00",
      motivoDaCorretiva: null,
      motivoDaVisita: "Visita programada",
      respostas: [],
      fotos: [],
      temAssinatura: false,
      enviadoPor: null,
    };

    const campos = Object.fromEntries(camposDoResumo(detalhe).map((c) => [c.rotulo, c.valor]));

    expect(campos).toMatchObject({
      ID: "1",
      "Número/Ano": "00001/2026",
      Modelo: "Portaria",
      "Enviado por": "",
      Situação: "Conforme",
      Conclusão: "Concluído (1/1)",
      Nota: "100%",
    });
  });
});

describe("interpretarNumeroAno", () => {
  it("le numero e ano, com ou sem espacos em volta da barra", () => {
    expect(interpretarNumeroAno("35/2026")).toEqual({ numero: 35, ano: 2026 });
    expect(interpretarNumeroAno(" 35 / 2026 ")).toEqual({ numero: 35, ano: 2026 });
  });

  it("so o numero procura em qualquer ano", () => {
    expect(interpretarNumeroAno("35")).toEqual({ numero: 35, ano: null });
  });

  it("recusa o que nao e Numero/Ano", () => {
    expect(interpretarNumeroAno("abc")).toBeNull();
    expect(interpretarNumeroAno("35/26")).toBeNull();
    expect(interpretarNumeroAno("/2026")).toBeNull();
    expect(interpretarNumeroAno("db38f3f0-69e0")).toBeNull();
  });
});

describe("montarArvore", () => {
  it("raizes e filhos em ordem alfabetica; superior que a pessoa nao enxerga vira raiz", () => {
    const sites = new Map([
      [1, { nome: "UP Serviços", superior: null }],
      [2, { nome: "Zeta", superior: 1 }],
      [3, { nome: "Alfa", superior: 1 }],
      [4, { nome: "Orfao", superior: 99 }],
    ]);
    const arvore = montarArvore(sites);
    expect(arvore.map((no) => no.nome)).toEqual(["Orfao", "UP Serviços"]);
    expect(arvore[1].filhos.map((no) => no.nome)).toEqual(["Alfa", "Zeta"]);
  });

  it("ciclo no cadastro nao entra em laco", () => {
    const sites = new Map([
      [8, { nome: "A", superior: 9 }],
      [9, { nome: "B", superior: 8 }],
    ]);
    expect(montarArvore(sites)).toEqual([]);
  });
});
