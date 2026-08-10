import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null };
type Chamada = { metodo: string; args: unknown[] };

const { createClientMock, fromResultado, chamadas } = vi.hoisted(() => {
  const fromResultado: Resultado = { data: [], error: null };
  const chamadas: Chamada[] = [];

  const createClientMock = vi.fn(async () => ({
    from() {
      const chain: Record<string, unknown> = {};
      for (const metodo of ["select", "order", "range", "or", "eq", "maybeSingle"]) {
        chain[metodo] = (...args: unknown[]) => {
          chamadas.push({ metodo, args });
          return metodo === "maybeSingle" ? Promise.resolve({ data: null, error: null }) : chain;
        };
      }
      chain.then = (resolve: (resultado: Resultado) => void) => resolve(fromResultado);
      return chain;
    },
  }));

  return { createClientMock, fromResultado, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const {
  extrairFiltros,
  getQrCodesParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
} = await import("./queries");

/** Filtros minimos para as consultas; `situacao` e obrigatoria desde que
 * ganhou "todos" e passou a ter padrao -- mesmo padrao de site-planta. */
function filtros(extra: Record<string, unknown> = {}) {
  return { situacao: "todos" as const, ...extra };
}

beforeEach(() => {
  fromResultado.data = [];
  fromResultado.error = null;
  chamadas.length = 0;
});

/** Linha completa do banco; cada teste sobrescreve so o que exercita. */
function qrRow(extra: Record<string, unknown> = {}) {
  return {
    id: 3,
    codigo: "QR-AGC-001",
    finalidade: "Entrada principal",
    ativo: true,
    site_id: 7,
    sites: {
      nome: "Agência Centro",
      grupo_site_id: 1,
      tipo_servico_id: 2,
      grupos_sites: { nome: "Cooplivre" },
    },
    ...extra,
  };
}

const select = () => chamadas.find((c) => c.metodo === "select")?.args[0] as string;

describe("extrairFiltros", () => {
  it("mapeia os nomes da querystring para o filtro", () => {
    expect(
      extrairFiltros({
        busca: "AGC",
        tipo_servico: "7",
        grupo_site: "1",
        situacao: "inativos",
        pagina: "2",
      }),
    ).toEqual({
      busca: "AGC",
      tipoServico: "7",
      grupoSite: "1",
      situacao: "inativos",
      pagina: 2,
    });
  });

  it("cai na página 1 para valor ausente ou inválido", () => {
    expect(extrairFiltros({}).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "0" }).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "abc" }).pagina).toBe(1);
  });

  it("cai no padrão (ativos) para situação ausente ou fora da lista", () => {
    expect(extrairFiltros({}).situacao).toBe("ativos");
    expect(extrairFiltros({ situacao: "xyz" }).situacao).toBe("ativos");
  });

  it("aceita 'todos' como situação explícita", () => {
    expect(extrairFiltros({ situacao: "todos" }).situacao).toBe("todos");
  });
});

describe("toTableRow", () => {
  it("tem uma célula por coluna da exportação", () => {
    // Se as duas listas saem de sincronia, o CSV desloca todas as colunas a
    // partir do ponto de divergencia -- sem erro nenhum.
    expect(toTableRow(qrRow())).toHaveLength(COLUNAS_EXPORTACAO.length);
  });

  it("traz o site e o grupo pelo embed", () => {
    const linha = toTableRow(qrRow());

    expect(linha[2]).toBe("Agência Centro");
    expect(linha[3]).toBe("Cooplivre");
  });

  /**
   * O embed de `sites` e opcional de proposito (ver `montarSelect`): com o
   * `!inner` sempre ligado, um QR cujo site o RLS nao devolveu sumiria da
   * listagem. Aparecendo com o local em branco, pelo menos e visivel.
   */
  it("aceita site ausente sem quebrar", () => {
    const linha = toTableRow(qrRow({ sites: null }));

    expect(linha[1]).toBe("QR-AGC-001");
    expect(linha[2]).toBe("");
    expect(linha[3]).toBe("");
  });

  it("traduz o booleano de situação", () => {
    expect(toTableRow(qrRow())[5]).toBe("Ativo");
    expect(toTableRow(qrRow({ ativo: false }))[5]).toBe("Inativo");
  });
});

describe("getQrCodesParaExportar", () => {
  it("sem busca, não aplica o filtro or()", async () => {
    await getQrCodesParaExportar(filtros());

    expect(chamadas.some((c) => c.metodo === "or")).toBe(false);
  });

  it("com busca, procura em código e finalidade", async () => {
    await getQrCodesParaExportar(filtros({ busca: "AGC" }));

    const or = chamadas.find((c) => c.metodo === "or");
    expect(or?.args[0]).toContain("codigo.ilike");
    expect(or?.args[0]).toContain("finalidade.ilike");
  });

  it("filtra por tipo de serviço com join inner, senão o filtro não restringe", async () => {
    // Filtrar dentro de um embed opcional nao restringe a consulta de cima.
    await getQrCodesParaExportar(filtros({ tipoServico: "7" }));

    expect(select()).toContain("sites!inner");
    expect(chamadas.filter((c) => c.metodo === "eq").map((c) => c.args)).toContainEqual([
      "sites.tipo_servico_id",
      "7",
    ]);
  });

  it("filtra por grupo com join inner, senão o filtro não restringe", async () => {
    // Filtrar dentro de um embed opcional nao restringe a consulta de cima.
    await getQrCodesParaExportar(filtros({ grupoSite: "1" }));

    expect(select()).toContain("sites!inner");
    expect(chamadas.filter((c) => c.metodo === "eq").map((c) => c.args)).toContainEqual([
      "sites.grupo_site_id",
      "1",
    ]);
  });

  it("ordena por código, sem desempate", async () => {
    // `codigo` e unique (migration 0003), entao a ordenacao ja e total.
    await getQrCodesParaExportar(filtros());

    expect(chamadas.filter((c) => c.metodo === "order").map((c) => c.args[0])).toEqual(["codigo"]);
  });

  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getQrCodesParaExportar(filtros());

    expect(chamadas.find((c) => c.metodo === "range")?.args).toEqual([0, LIMITE_EXPORTACAO]);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    fromResultado.data = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) => qrRow({ id: i }));

    const { rows, truncado } = await getQrCodesParaExportar(filtros());

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });

  it("não truncado quando o resultado cabe no limite", async () => {
    fromResultado.data = [qrRow()];

    const { rows, truncado } = await getQrCodesParaExportar(filtros());

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });
});
