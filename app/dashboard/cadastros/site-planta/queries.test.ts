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
  montarHierarquiaDeResponsaveis,
  toTableRow,
  COLUNAS_EXPORTACAO,
  LIMITE_EXPORTACAO,
} = await import("./queries");

/** Filtros minimos para as consultas; `situacao` e obrigatoria desde que
 * ganhou "todos" e passou a ter padrao. */
function filtros(extra: Record<string, unknown> = {}) {
  return { situacao: "todos" as const, ...extra };
}

/** Posicao de cada coluna, para os testes nao carregarem numero solto. */
const COL = Object.fromEntries(COLUNAS_EXPORTACAO.map((nome, i) => [nome, i])) as Record<
  string,
  number
>;

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
    criado_em: "2026-03-17T18:09:00.000Z",
    grupo_site_id: 1,
    tipo_servico_id: 2,
    responsavel_id: null,
    grupos_sites: { nome: "Cooplivre" },
    tipos_servico: { nome: "Portaria" },
    responsavel: { nome_completo: "Maria Silva" },
    criador: { nome_completo: "Gesiel" },
    // Migration 0021.
    site_superior_id: null,
    cep: null,
    endereco: null,
    numero: null,
    bairro: null,
    complemento: null,
    pais: "Brasil",
    raio_metros: null,
    cod_cliente: null,
    cod_posto: null,
    filial: null,
    info_adicional_1: null,
    info_adicional_2: null,
    recebe_visita: true,
    gerar_qrcode_automatico: true,
    gerar_registro_coletas: false,
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
        responsavel: "abc",
        situacao: "inativos",
        pagina: "3",
      }),
    ).toEqual({
      busca: "centro",
      grupoSite: "1",
      tipoServico: "2",
      responsavel: "abc",
      situacao: "inativos",
      pagina: 3,
    });
  });

  /** A tela abre escondendo site desativado, como no sistema de referencia. */
  it("cai em 'ativos' quando a situacao nao vem na URL", () => {
    expect(extrairFiltros({}).situacao).toBe("ativos");
  });

  it("cai no padrao para situacao fora da lista, em vez de nao filtrar", () => {
    // `?situacao=xyz` mostrando tudo seria mentira silenciosa: a URL e editavel.
    expect(extrairFiltros({ situacao: "xyz" }).situacao).toBe("ativos");
  });

  it("aceita 'todos' como escolha explicita de nao filtrar", () => {
    expect(extrairFiltros({ situacao: "todos" }).situacao).toBe("todos");
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

  it("separa cidade e UF em colunas proprias, como na referencia", () => {
    const linha = toTableRow(siteRow());

    expect(linha[COL["Cidade"]]).toBe("Porto Alegre");
    expect(linha[COL["UF"]]).toBe("RS");
  });

  it("deixa as coordenadas em branco quando nao foram cadastradas", () => {
    // Nula quer dizer "ainda nao cadastrada" (migration 0003), nao zero.
    const linha = toTableRow(siteRow({ latitude: null, longitude: null }));

    expect(linha[COL["Lat/Long"]]).toBe("");
  });

  it("nao inventa meia coordenada", () => {
    expect(toTableRow(siteRow({ longitude: null }))[COL["Lat/Long"]]).toBe("");
  });

  it("traduz o booleano de situacao", () => {
    expect(toTableRow(siteRow())[COL["Status"]]).toBe("Ativo");
    expect(toTableRow(siteRow({ ativo: false }))[COL["Status"]]).toBe("Inativo");
  });

  it("monta a hierarquia organizacao > grupo > site", () => {
    expect(toTableRow(siteRow())[COL["Hierarquia"]]).toBe(
      "UP Serviços > Cooplivre > Agência Centro",
    );
  });

  it("omite o nivel do grupo quando a relacao nao veio, sem separador solto", () => {
    expect(toTableRow(siteRow({ grupos_sites: null }))[COL["Hierarquia"]]).toBe(
      "UP Serviços > Agência Centro",
    );
  });

  it("traz quem cadastrou", () => {
    expect(toTableRow(siteRow())[COL["Usuário"]]).toBe("Gesiel");
  });

  /** A FK de `criado_por` e `on delete set null`: perfil apagado deixa a
   * coluna vazia, e a linha continua valendo. */
  it("aceita criador ausente sem quebrar", () => {
    expect(toTableRow(siteRow({ criador: null }))[COL["Usuário"]]).toBe("");
  });
});

describe("montarHierarquiaDeResponsaveis", () => {
  const perfil = (id: string, nome: string, superior: string | null = null) => ({
    id,
    nome_completo: nome,
    superior_id: superior,
  });

  it("indenta por profundidade, como na referencia", () => {
    const opcoes = montarHierarquiaDeResponsaveis([
      perfil("a", "Gesiel"),
      perfil("b", "Gilmar", "a"),
    ]);

    expect(opcoes).toEqual([
      { value: "a", label: "->Gesiel" },
      { value: "b", label: "--->Gilmar" },
    ]);
  });

  /**
   * O RLS de `profiles` (migration 0006) recorta a lista. Sem tratar o superior
   * ausente como raiz, quem tem chefe fora do recorte sumiria da lista inteira.
   */
  it("promove a raiz quem tem superior fora do recorte do RLS", () => {
    const opcoes = montarHierarquiaDeResponsaveis([perfil("b", "Gilmar", "desaparecido")]);

    expect(opcoes).toEqual([{ value: "b", label: "->Gilmar" }]);
  });

  /** `superior_id` nao tem trava contra ciclo no banco; sem o conjunto de
   * visitados a recursao nao terminaria e a tela travaria no servidor. */
  it("nao entra em loop quando dois perfis chefiam um ao outro", () => {
    const opcoes = montarHierarquiaDeResponsaveis([
      perfil("a", "Ana", "b"),
      perfil("b", "Bruno", "a"),
    ]);

    expect(opcoes).toHaveLength(2);
  });

  it("nao quebra com perfil sem nome preenchido", () => {
    expect(montarHierarquiaDeResponsaveis([perfil("a", null as unknown as string)])).toEqual([
      { value: "a", label: "->(sem nome)" },
    ]);
  });
});

describe("getSitesParaExportar", () => {
  it("sem busca, nao aplica o filtro or()", async () => {
    await getSitesParaExportar(filtros());

    expect(chamadas.some((c) => c.metodo === "or")).toBe(false);
  });

  it("com busca textual, procura em nome, sigla, cidade e regional", async () => {
    await getSitesParaExportar(filtros({ busca: "centro" }));

    const or = chamadas.find((c) => c.metodo === "or");
    expect(or?.args[0]).toContain("nome.ilike");
    expect(or?.args[0]).toContain("sigla.ilike");
    expect(or?.args[0]).toContain("cidade.ilike");
    expect(or?.args[0]).toContain("regional.ilike");
  });

  /**
   * `id` e bigint: `id.eq.abc` faz o PostgREST recusar a consulta inteira
   * (22P02). Por isso o ramo do id so entra quando o termo e so digito.
   */
  it("busca por id quando o termo e numerico", async () => {
    await getSitesParaExportar(filtros({ busca: "439341" }));

    expect(chamadas.find((c) => c.metodo === "or")?.args[0]).toContain("id.eq.439341");
  });

  it("nao arrisca o ramo de id quando o termo tem letra", async () => {
    await getSitesParaExportar(filtros({ busca: "Rafard" }));

    expect(chamadas.find((c) => c.metodo === "or")?.args[0]).not.toContain("id.eq");
  });

  it("aplica os mesmos filtros de select da listagem", async () => {
    await getSitesParaExportar(
      filtros({ grupoSite: "1", tipoServico: "2", responsavel: "abc", situacao: "inativos" }),
    );

    const eqs = chamadas.filter((c) => c.metodo === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["grupo_site_id", "1"]);
    expect(eqs).toContainEqual(["tipo_servico_id", "2"]);
    expect(eqs).toContainEqual(["responsavel_id", "abc"]);
    expect(eqs).toContainEqual(["ativo", false]);
  });

  it("'todos' e a unica situacao que nao vira clausula", async () => {
    await getSitesParaExportar(filtros({ situacao: "todos" }));

    const eqs = chamadas.filter((c) => c.metodo === "eq").map((c) => c.args[0]);
    expect(eqs).not.toContain("ativo");
  });

  it("ordena por nome com desempate por id", async () => {
    // `sites.nome` nao e unico (a unicidade e do par com o grupo), entao sem o
    // desempate a paginacao pode repetir uma linha e pular outra.
    await getSitesParaExportar(filtros());

    const orders = chamadas.filter((c) => c.metodo === "order").map((c) => c.args[0]);
    expect(orders).toEqual(["nome", "id"]);
  });

  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getSitesParaExportar(filtros());

    const range = chamadas.find((c) => c.metodo === "range");
    expect(range?.args).toEqual([0, LIMITE_EXPORTACAO]);
  });

  it("nao truncado quando o resultado cabe no limite", async () => {
    fromResultado.data = [siteRow()];

    const { rows, truncado } = await getSitesParaExportar(filtros());

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    fromResultado.data = Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) =>
      siteRow({ id: i }),
    );

    const { rows, truncado } = await getSitesParaExportar(filtros());

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});
