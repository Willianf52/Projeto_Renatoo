import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null; count: number };
type Ordem = { coluna: string; ascending?: boolean };

/** Encadeamento minimo do query builder do Supabase; o objeto e "thenable",
 * entao `await query` resolve o resultado. */
type Chain = {
  select: () => Chain;
  eq: (coluna: string, valor: unknown) => Chain;
  ilike: () => Chain;
  or: (filtro: string) => Chain;
  not: () => Chain;
  limit: () => Chain;
  in: (coluna: string, valores: unknown[]) => Chain;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  range: () => Chain;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Chain;
  then: (resolve: (resultado: Resultado) => void) => void;
};

const { createClientMock, eqs, ins, lista, ordens, ors, rpcResultado, superiores } = vi.hoisted(() => {
  const ordens: Ordem[] = [];
  const ins: [string, unknown[]][] = [];
  /** O que a consulta da listagem devolve, e o que a dos superiores (a que usa
   * `.in`) devolve. */
  const lista: { data: unknown[] } = { data: [] };
  const superiores: { data: unknown[] } = { data: [] };
  const ors: string[] = [];
  const eqs: [string, unknown][] = [];
  const rpcResultado: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: null,
  };

  const createClientMock = vi.fn(async () => ({
    from() {
      let porId = false;
      const chain: Chain = {
        select: () => chain,
        eq: (coluna, valor) => {
          eqs.push([coluna, valor]);
          return chain;
        },
        ilike: () => chain,
        or: (filtro) => {
          ors.push(filtro);
          return chain;
        },
        not: () => chain,
        limit: () => chain,
        in: (coluna, valores) => {
          porId = true;
          ins.push([coluna, valores]);
          return chain;
        },
        maybeSingle: async () => ({ data: lista.data[0] ?? null, error: null }),
        range: () => chain,
        order: (coluna, opcoes) => {
          ordens.push({ coluna, ascending: opcoes?.ascending });
          return chain;
        },
        then: (resolve) => {
          const data = porId ? superiores.data : lista.data;
          resolve({ data, error: null, count: data.length });
        },
      };
      return chain;
    },
    rpc: async () => rpcResultado,
  }));

  return { createClientMock, eqs, ins, lista, ordens, ors, rpcResultado, superiores };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { getUsuario, getUsuarios, montarSelectDeUsuarios, podeVerTodaOperacao, toTableRow } = await import(
  "./queries"
);

beforeEach(() => {
  ordens.length = 0;
  ors.length = 0;
  eqs.length = 0;
  ins.length = 0;
  lista.data = [];
  superiores.data = [];
  rpcResultado.data = null;
  rpcResultado.error = null;
});

describe("montarSelectDeUsuarios", () => {
  it("sem filtro de grupo, nao embute a tabela de membros", () => {
    const select = montarSelectDeUsuarios(false);

    expect(select).not.toContain("grupos_usuarios_membros");
    expect(select).toContain("superior_id");
    // O embed de `profiles` nela mesma nao devolvia o superior -- ver
    // `comNomeDoSuperior` em queries.ts.
    expect(select).not.toContain("profiles!");
  });

  it("com filtro de grupo, embute os membros como inner para filtrar no banco", () => {
    const select = montarSelectDeUsuarios(true);

    expect(select).toContain("grupos_usuarios_membros!inner ( grupo_id )");
  });
});

/** Perfil como vem do banco, sem o `superior` resolvido. */
const perfil = (id: string, nome: string, superiorId: string | null) => ({
  id,
  nome_completo: nome,
  login: null,
  email: `${id}@exemplo.com`,
  funcao: null,
  cargo: "OPERACIONAL",
  tipo: "PADRAO",
  ativo: true,
  pais: "Brasil",
  superior_id: superiorId,
});

describe("nome do superior", () => {
  /** A coluna "Usuário Superior" saia em branco com o superior gravado no
   * banco (auditoria de paridade de 28/10/2026). */
  it("a listagem preenche o superior pelo id, numa consulta a parte", async () => {
    lista.data = [perfil("a", "Ana", "c"), perfil("b", "Bruno", "c"), perfil("c", "Carla", null)];
    superiores.data = [{ id: "c", nome_completo: "Carla" }];

    const { rows } = await getUsuarios({ pagina: 1 });

    expect(ins).toEqual([["id", ["c"]]]);
    expect(rows.map((r) => [r.nome_completo, r.superior?.nome_completo ?? null])).toEqual([
      ["Ana", "Carla"],
      ["Bruno", "Carla"],
      ["Carla", null],
    ]);
  });

  it("pagina sem ninguem com superior nao faz a segunda consulta", async () => {
    lista.data = [perfil("a", "Ana", null)];

    const { rows } = await getUsuarios({ pagina: 1 });

    expect(ins).toEqual([]);
    expect(rows[0].superior).toBeNull();
  });

  /** O RLS pode esconder o superior de quem le: celula em branco, sem erro. */
  it("superior que nao voltou na consulta fica em branco", async () => {
    lista.data = [perfil("a", "Ana", "invisivel")];

    const { rows } = await getUsuarios({ pagina: 1 });

    expect(rows[0].superior).toBeNull();
  });

  it("o formulario tambem recebe o nome do superior", async () => {
    lista.data = [perfil("a", "Ana", "c")];
    superiores.data = [{ id: "c", nome_completo: "Carla" }];

    const usuario = await getUsuario("a");

    expect(usuario?.superior_id).toBe("c");
    expect(usuario?.superior).toEqual({ nome_completo: "Carla" });
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

  it("busca livre alcanca nome, login, e-mail e pais", async () => {
    await getUsuarios({ pagina: 1, busca: "gilmar" });

    expect(ors).toEqual([
      'nome_completo.ilike."%gilmar%",login.ilike."%gilmar%",email.ilike."%gilmar%",pais.ilike."%gilmar%"',
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

  /** A tela abre em "Ativos", como o antigo (auditoria de 12/10/2026); "Todos"
   * e a unica opcao que nao vira clausula. */
  it("situacao: ativos e inativos filtram, todos nao", async () => {
    await getUsuarios({ pagina: 1, situacao: "ativos" });
    expect(eqs).toContainEqual(["ativo", true]);

    eqs.length = 0;
    await getUsuarios({ pagina: 1, situacao: "inativos" });
    expect(eqs).toContainEqual(["ativo", false]);

    eqs.length = 0;
    await getUsuarios({ pagina: 1, situacao: "todos" });
    expect(eqs.some(([coluna]) => coluna === "ativo")).toBe(false);
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
      pais: "Brasil",
      superior_id: "def",
      superior: { nome_completo: "Gesiel" },
    });

    expect(linha).toEqual([
      "Gilmar",
      "Gilmar@servicosup.com.br",
      "Gesiel",
      "operacional010@servicosup.com",
      "Líder de limpeza",
      "Operacional",
      "Brasil",
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
      pais: "Brasil",
      superior_id: null,
      superior: null,
    });

    expect(linha).toEqual([
      "",
      "",
      "",
      "sem.nome@exemplo.com",
      "",
      "Cliente",
      "Brasil",
      "Inativo",
    ]);
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
