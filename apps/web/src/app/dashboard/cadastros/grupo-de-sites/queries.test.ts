import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null };
type Chamada = { metodo: string; args: unknown[] };

const { createClientMock, rpcResultado, fromResultado, porTabela, chamadas } = vi.hoisted(() => {
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  const fromResultado: Resultado = { data: [], error: null };
  const chamadas: Chamada[] = [];
  /** Resultado proprio de uma tabela; sem entrada, vale `fromResultado`. So a
   * primeira pagina (range a partir de 0) recebe as linhas, para
   * `buscarEmPaginas` parar na segunda. */
  const porTabela: Record<string, unknown[]> = {};

  const createClientMock = vi.fn(async () => ({
    rpc: async () => rpcResultado,
    from(tabela: string) {
      let inicio = 0;
      const chain = {
        select: (...args: unknown[]) => {
          chamadas.push({ metodo: "select", args });
          return chain;
        },
        order: (...args: unknown[]) => {
          chamadas.push({ metodo: "order", args });
          return chain;
        },
        range: (...args: unknown[]) => {
          chamadas.push({ metodo: "range", args });
          inicio = Number(args[0]);
          return chain;
        },
        in: (...args: unknown[]) => {
          chamadas.push({ metodo: `in:${tabela}`, args });
          return chain;
        },
        eq: (...args: unknown[]) => {
          chamadas.push({ metodo: `eq:${tabela}`, args });
          return chain;
        },
        or: (...args: unknown[]) => {
          chamadas.push({ metodo: "or", args });
          return chain;
        },
        neq: (...args: unknown[]) => {
          chamadas.push({ metodo: "neq", args });
          return chain;
        },
        then: (resolve: (resultado: Resultado) => void) => {
          const linhas = porTabela[tabela];
          if (!linhas) return resolve(fromResultado);
          resolve({ data: inicio === 0 ? linhas : [], error: null });
        },
      };
      return chain;
    },
  }));

  return { createClientMock, rpcResultado, fromResultado, porTabela, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

// `podeAdministrarCadastros` saiu daqui para `lib/permissoes.ts` quando a tela
// de Site / Planta passou a precisar da mesma regra -- os testes dela foram
// junto, para `lib/permissoes.test.ts`.
const {
  COLUNAS_DA_TELA,
  COLUNAS_DO_EXCEL,
  getGruposSites,
  getGruposSitesParaExportar,
  getGruposSitesParaPai,
  montarHierarquiaDeSites,
  montarLinhasDaLista,
  textoDosSites,
  toLinhaDaTela,
  toLinhaDoExcel,
  LIMITE_EXPORTACAO,
} = await import("./queries");

beforeEach(() => {
  rpcResultado.data = null;
  rpcResultado.error = null;
  fromResultado.data = [];
  fromResultado.error = null;
  chamadas.length = 0;
  for (const tabela of Object.keys(porTabela)) delete porTabela[tabela];
});

describe("getGruposSitesParaExportar", () => {
  it("sem busca, nao aplica o filtro or()", async () => {
    await getGruposSitesParaExportar(undefined);

    expect(chamadas.some((c) => c.metodo === "or")).toBe(false);
  });

  it("com busca, aplica o mesmo or() de nome/descricao da listagem", async () => {
    await getGruposSitesParaExportar("portaria");

    const or = chamadas.find((c) => c.metodo === "or");
    expect(or?.args[0]).toContain("nome.ilike");
    expect(or?.args[0]).toContain("descricao.ilike");
  });

  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getGruposSitesParaExportar(undefined);

    const range = chamadas.find((c) => c.metodo === "range");
    expect(range?.args).toEqual([0, LIMITE_EXPORTACAO]);
  });

  it("nao truncado quando o resultado cabe no limite", async () => {
    fromResultado.data = [{ id: 1, nome: "A", descricao: null, ativo: true }];

    const { rows, truncado } = await getGruposSitesParaExportar(undefined);

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    fromResultado.data = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) => ({
      id: i,
      nome: `Grupo ${i}`,
      descricao: null,
      ativo: true,
    }));

    const { rows, truncado } = await getGruposSitesParaExportar(undefined);

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});

describe("getGruposSitesParaPai", () => {
  it("sem id em edicao, nao aplica neq()", async () => {
    await getGruposSitesParaPai();

    expect(chamadas.some((c) => c.metodo === "neq")).toBe(false);
  });

  it("com id em edicao, exclui o proprio grupo da lista", async () => {
    await getGruposSitesParaPai(7);

    const neq = chamadas.find((c) => c.metodo === "neq");
    expect(neq?.args).toEqual(["id", 7]);
  });
});

describe("montarHierarquiaDeSites", () => {
  const grupo = 1;

  it("mantem raizes na profundidade 0, sem pai", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 1, nome: "Matriz", site_superior_id: null, grupo_site_id: grupo },
    ]);

    expect(opcoes).toEqual([
      { id: 1, nome: "Matriz", profundidade: 0, paiId: null, grupoSiteId: grupo },
    ]);
  });

  it("poe filho depois do pai, com profundidade maior e paiId marcado", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 2, nome: "Filial", site_superior_id: 1, grupo_site_id: grupo },
      { id: 1, nome: "Matriz", site_superior_id: null, grupo_site_id: grupo },
    ]);

    expect(opcoes.map((o) => o.id)).toEqual([1, 2]);
    expect(opcoes[1]).toMatchObject({ profundidade: 1, paiId: 1 });
  });

  it("trata pai fora da lista como raiz, em vez de sumir com o site", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 2, nome: "Filial", site_superior_id: 999, grupo_site_id: grupo },
    ]);

    expect(opcoes).toEqual([
      { id: 2, nome: "Filial", profundidade: 0, paiId: null, grupoSiteId: grupo },
    ]);
  });

  it("nao entra em loop com ciclo, e nao deixa nenhum site de fora", () => {
    const opcoes = montarHierarquiaDeSites([
      { id: 1, nome: "A", site_superior_id: 2, grupo_site_id: grupo },
      { id: 2, nome: "B", site_superior_id: 1, grupo_site_id: grupo },
    ]);

    expect(opcoes).toHaveLength(2);
    expect(opcoes.map((o) => o.id).sort()).toEqual([1, 2]);
  });
});

describe("coluna Sites do Excel", () => {
  it("pede os sites junto com o grupo", async () => {
    await getGruposSitesParaExportar(undefined);

    const select = chamadas.find((c) => c.metodo === "select");
    expect(String(select?.args[0])).toContain("sites ( nome, ativo )");
  });

  it("cada nome seguido do seu ponto e virgula, como no antigo", () => {
    expect(textoDosSites([{ nome: "ACE Limpeza", ativo: true }])).toBe("ACE Limpeza;");
    expect(
      textoDosSites([
        { nome: "Sicredi Osasco", ativo: true },
        { nome: "Sicredi Cotia", ativo: true },
      ]),
    ).toBe("Sicredi Cotia;Sicredi Osasco;");
  });

  it("so os ativos, em ordem alfabetica sem distinguir caixa nem acento", () => {
    expect(
      textoDosSites([
        { nome: "ipiranga", ativo: true },
        { nome: "Ibiúna", ativo: true },
        { nome: "Zeta", ativo: false },
        { nome: "Água Branca", ativo: true },
      ]),
    ).toBe("Água Branca;Ibiúna;ipiranga;");
  });

  it("grupo sem site ativo fica com a celula vazia", () => {
    expect(textoDosSites([])).toBe("");
    expect(textoDosSites([{ nome: "Fechado", ativo: false }])).toBe("");
  });

  it("a linha do Excel e a da tela mais a coluna Sites, na ordem do cabecalho", () => {
    const linha = toLinhaDoExcel({
      id: 9220,
      nome: "ACE Limpeza",
      descricao: null,
      ativo: true,
      sites: [{ nome: "ACE Limpeza", ativo: true }],
    });

    expect(COLUNAS_DO_EXCEL).toEqual(["ID", "Nome", "Status", "Descrição", "Sites"]);
    expect(linha).toEqual(["9220", "ACE Limpeza", "Ativo", "", "ACE Limpeza;"]);
    expect(linha).toHaveLength(COLUNAS_DO_EXCEL.length);
  });
});

/** Colunas "Grupo de Site Pai" e "Sites" do antigo, que faltavam na listagem
 * (auditoria de paridade de 28/10/2026). */
describe("listagem com pai e quantidade de sites", () => {
  const grupo = (id: number, nome: string, paiId: number | null) => ({
    id,
    nome,
    descricao: null,
    ativo: true,
    grupo_pai_id: paiId,
  });

  it("poe o nome do pai e conta os sites de cada grupo", () => {
    const linhas = montarLinhasDaLista(
      [grupo(1, "Lote 1", null), grupo(2, "Portarias", 1), grupo(3, "Sem sites", 99)],
      [{ id: 1, nome: "Lote 1" }],
      [{ grupo_site_id: 1 }, { grupo_site_id: 2 }, { grupo_site_id: 2 }],
    );

    expect(linhas.map((l) => [l.nome, l.grupoPai, l.quantidadeDeSites])).toEqual([
      ["Lote 1", "", 1],
      ["Portarias", "Lote 1", 2],
      // Pai que o leitor nao enxerga (ou que sumiu) vira celula em branco.
      ["Sem sites", "", 0],
    ]);
  });

  it("a linha da tela segue a ordem do cabecalho do antigo", () => {
    const [linha] = montarLinhasDaLista([grupo(9, "Portarias", 1)], [{ id: 1, nome: "Lote 1" }], [
      { grupo_site_id: 9 },
    ]);

    expect(COLUNAS_DA_TELA).toEqual(["ID", "Nome", "Grupo de Site Pai", "Sites", "Status", "Descrição"]);
    expect(toLinhaDaTela(linha)).toEqual(["9", "Portarias", "Lote 1", "1", "Ativo", ""]);
  });

  it("busca o pai e os sites ativos so dos grupos da pagina", async () => {
    porTabela.grupos_sites = [grupo(1, "Lote 1", null), grupo(2, "Portarias", 1)];
    porTabela.sites = [{ grupo_site_id: 2 }];

    const { rows } = await getGruposSites({ pagina: 1 });

    expect(chamadas).toContainEqual({ metodo: "in:grupos_sites", args: ["id", [1]] });
    expect(chamadas).toContainEqual({ metodo: "in:sites", args: ["grupo_site_id", [1, 2]] });
    expect(chamadas).toContainEqual({ metodo: "eq:sites", args: ["ativo", true] });
    expect(rows.map((r) => r.quantidadeDeSites)).toEqual([0, 1]);
  });

  it("pagina vazia nao faz as consultas extras", async () => {
    porTabela.grupos_sites = [];

    await getGruposSites({ pagina: 1 });

    expect(chamadas.some((c) => c.metodo.startsWith("in:"))).toBe(false);
  });
});
