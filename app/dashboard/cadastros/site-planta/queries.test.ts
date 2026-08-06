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
  getSitesParaExportar,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
} = await import("./queries");

beforeEach(() => {
  fromResultado.data = [];
  fromResultado.error = null;
  chamadas.length = 0;
});

/** Linha completa do banco; cada teste sobrescreve so o que exercita. */
function siteRow(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    nome: "Agência Centro",
    sigla: "AGC",
    regional: "Sul",
    cidade: "Porto Alegre",
    uf: "RS",
    latitude: -30.0346,
    longitude: -51.2177,
    observacao: null,
    ativo: true,
    grupo_site_id: 1,
    tipo_servico_id: 2,
    responsavel_id: null,
    grupos_sites: { nome: "Cooplivre" },
    tipos_servico: { nome: "Portaria" },
    profiles: { nome_completo: "Maria Silva" },
    ...extra,
  };
}

describe("extrairFiltros", () => {
  it("mapeia os nomes da querystring para o filtro", () => {
    expect(
      extrairFiltros({
        busca: "centro",
        grupo_site: "1",
        tipo_servico: "2",
        situacao: "ativos",
        pagina: "3",
      }),
    ).toEqual({
      busca: "centro",
      grupoSite: "1",
      tipoServico: "2",
      situacao: "ativos",
      pagina: 3,
    });
  });

  it("usa a primeira ocorrencia quando a chave vem repetida na URL", () => {
    expect(extrairFiltros({ busca: ["centro", "norte"] }).busca).toBe("centro");
  });

  it("cai na pagina 1 para valor ausente, zero ou negativo", () => {
    expect(extrairFiltros({}).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "0" }).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "-5" }).pagina).toBe(1);
    expect(extrairFiltros({ pagina: "abc" }).pagina).toBe(1);
  });
});

describe("toTableRow", () => {
  it("tem uma celula por coluna da exportacao", () => {
    // Se as duas listas saem de sincronia, o CSV desloca todas as colunas a
    // partir do ponto de divergencia -- sem erro nenhum.
    expect(toTableRow(siteRow())).toHaveLength(COLUNAS_EXPORTACAO.length);
  });

  it("junta cidade e UF", () => {
    expect(toTableRow(siteRow())[5]).toBe("Porto Alegre / RS");
  });

  it("nao deixa separador solto quando falta a UF", () => {
    expect(toTableRow(siteRow({ uf: null }))[5]).toBe("Porto Alegre");
  });

  it("deixa as coordenadas em branco quando nao foram cadastradas", () => {
    // Nula quer dizer "ainda nao cadastrada" (migration 0003), nao zero.
    expect(toTableRow(siteRow({ latitude: null, longitude: null }))[8]).toBe("");
  });

  it("nao inventa meia coordenada", () => {
    expect(toTableRow(siteRow({ longitude: null }))[8]).toBe("");
  });

  it("traduz o booleano de situacao", () => {
    expect(toTableRow(siteRow())[9]).toBe("Ativo");
    expect(toTableRow(siteRow({ ativo: false }))[9]).toBe("Inativo");
  });

  it("aceita relacao ausente sem quebrar", () => {
    const linha = toTableRow(siteRow({ tipos_servico: null, profiles: null }));

    expect(linha[4]).toBe("");
    expect(linha[7]).toBe("");
  });
});

describe("getSitesParaExportar", () => {
  it("sem busca, nao aplica o filtro or()", async () => {
    await getSitesParaExportar({});

    expect(chamadas.some((c) => c.metodo === "or")).toBe(false);
  });

  it("com busca, procura em nome, sigla e cidade", async () => {
    await getSitesParaExportar({ busca: "centro" });

    const or = chamadas.find((c) => c.metodo === "or");
    expect(or?.args[0]).toContain("nome.ilike");
    expect(or?.args[0]).toContain("sigla.ilike");
    expect(or?.args[0]).toContain("cidade.ilike");
  });

  it("aplica os mesmos filtros de select da listagem", async () => {
    await getSitesParaExportar({ grupoSite: "1", tipoServico: "2", situacao: "inativos" });

    const eqs = chamadas.filter((c) => c.metodo === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["grupo_site_id", "1"]);
    expect(eqs).toContainEqual(["tipo_servico_id", "2"]);
    expect(eqs).toContainEqual(["ativo", false]);
  });

  it("ordena por nome com desempate por id", async () => {
    // `sites.nome` nao e unico (a unicidade e do par com o grupo), entao sem o
    // desempate a paginacao pode repetir uma linha e pular outra.
    await getSitesParaExportar({});

    const orders = chamadas.filter((c) => c.metodo === "order").map((c) => c.args[0]);
    expect(orders).toEqual(["nome", "id"]);
  });

  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getSitesParaExportar({});

    const range = chamadas.find((c) => c.metodo === "range");
    expect(range?.args).toEqual([0, LIMITE_EXPORTACAO]);
  });

  it("nao truncado quando o resultado cabe no limite", async () => {
    fromResultado.data = [siteRow()];

    const { rows, truncado } = await getSitesParaExportar({});

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    fromResultado.data = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) =>
      siteRow({ id: i }),
    );

    const { rows, truncado } = await getSitesParaExportar({});

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});
