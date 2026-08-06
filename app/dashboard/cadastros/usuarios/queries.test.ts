import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null; count: number };
type Ordem = { coluna: string; ascending?: boolean };

/** Encadeamento minimo do query builder do Supabase; o objeto e "thenable",
 * entao `await query` resolve o resultado. */
type Chain = {
  select: () => Chain;
  eq: () => Chain;
  ilike: () => Chain;
  or: (filtro: string) => Chain;
  not: () => Chain;
  limit: () => Chain;
  range: () => Chain;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Chain;
  then: (resolve: (resultado: Resultado) => void) => void;
};

const { createClientMock, ordens, ors, rpcResultado } = vi.hoisted(() => {
  const ordens: Ordem[] = [];
  const ors: string[] = [];
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  const createClientMock = vi.fn(async () => ({
    from() {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        or: (filtro) => {
          ors.push(filtro);
          return chain;
        },
        not: () => chain,
        limit: () => chain,
        range: () => chain,
        order: (coluna, opcoes) => {
          ordens.push({ coluna, ascending: opcoes?.ascending });
          return chain;
        },
        then: (resolve) => resolve({ data: [], error: null, count: 0 }),
      };
      return chain;
    },
    rpc: async () => rpcResultado,
  }));

  return { createClientMock, ordens, ors, rpcResultado };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { getUsuarios, montarSelectDeUsuarios, podeVerTodaOperacao, toTableRow } = await import(
  "./queries"
);

beforeEach(() => {
  ordens.length = 0;
  ors.length = 0;
  rpcResultado.data = null;
  rpcResultado.error = null;
});

describe("montarSelectDeUsuarios", () => {
  it("sem filtro de grupo, nao embute a tabela de membros", () => {
    const select = montarSelectDeUsuarios(false);

    expect(select).not.toContain("grupos_usuarios_membros");
    expect(select).toContain("superior:profiles!superior_id");
  });

  it("com filtro de grupo, embute os membros como inner para filtrar no banco", () => {
    const select = montarSelectDeUsuarios(true);

    expect(select).toContain("grupos_usuarios_membros!inner ( grupo_id )");
  });
});

describe("getUsuarios", () => {
  /**
   * `nome_completo` e nullable e sem unique (migrations 0001/0003): homonimos
   * e perfis sem nome empatam, e sem desempate a ordem entre eles muda a cada
   * consulta -- ou seja, a cada troca de pagina.
   */
  it("desempata a ordenacao por id", async () => {
    await getUsuarios({ pagina: 1 });

    expect(ordens).toEqual([
      { coluna: "nome_completo", ascending: true },
      { coluna: "id", ascending: true },
    ]);
  });

  it("busca livre alcanca nome, login e e-mail", async () => {
    await getUsuarios({ pagina: 1, busca: "gilmar" });

    expect(ors).toEqual([
      'nome_completo.ilike."%gilmar%",login.ilike."%gilmar%",email.ilike."%gilmar%"',
    ]);
  });

  /** Sem escape, o "%" digitado casaria com qualquer coisa e a busca
   * devolveria a lista inteira. Ver `lib/postgrest-escape.ts`. */
  it("escapa curinga digitado na busca livre", async () => {
    await getUsuarios({ pagina: 1, busca: "100%" });

    expect(ors[0]).toContain('nome_completo.ilike."%100\\\\%%"');
  });

  it("sem busca, nao monta filtro or", async () => {
    await getUsuarios({ pagina: 1 });

    expect(ors).toEqual([]);
  });
});

/** A ordem daqui e a de `TABLE_COLUMNS` em `page.tsx` sao o mesmo contrato:
 * desalinhadas, cada celula aparece embaixo do cabecalho errado -- sem erro
 * nenhum, so dado trocado na tela. */
describe("toTableRow", () => {
  it("devolve as colunas na ordem da tabela", () => {
    const linha = toTableRow({
      id: "abc",
      nome_completo: "Gilmar",
      login: "Gilmar@servicosup.com.br",
      email: "operacional010@servicosup.com",
      funcao: "Líder de limpeza",
      cargo: "OPERACIONAL",
      tipo: "PADRAO",
      ativo: true,
      superior: { nome_completo: "Gesiel" },
    });

    expect(linha).toEqual([
      "Gilmar",
      "Gilmar@servicosup.com.br",
      "Gesiel",
      "operacional010@servicosup.com",
      "Líder de limpeza",
      "Operacional",
      "Ativo",
    ]);
  });

  it("celula vazia no lugar do superior quando nao ha", () => {
    const linha = toTableRow({
      id: "abc",
      nome_completo: null,
      login: null,
      email: "sem.nome@exemplo.com",
      funcao: null,
      cargo: "CLIENTE",
      tipo: "PADRAO",
      ativo: false,
      superior: null,
    });

    expect(linha).toEqual(["", "", "", "sem.nome@exemplo.com", "", "Cliente", "Inativo"]);
  });
});

describe("podeVerTodaOperacao", () => {
  it("repassa o resultado do RPC", async () => {
    rpcResultado.data = true;

    expect(await podeVerTodaOperacao()).toBe(true);
  });

  it("nega por padrao quando o RPC falha, em vez de liberar", async () => {
    rpcResultado.error = { message: "conexão perdida" };

    expect(await podeVerTodaOperacao()).toBe(false);
  });
});
