import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null; count: number };
type Ordem = { tabela: string; coluna: string; ascending?: boolean };

/** Encadeamento minimo do query builder do Supabase: todo metodo devolve a si
 * mesmo e o objeto e "thenable", entao `await query` resolve o resultado. */
type Chain = {
  select: (colunas?: string, opcoes?: { count?: string }) => Chain;
  eq: () => Chain;
  not: () => Chain;
  is: () => Chain;
  gte: () => Chain;
  lte: () => Chain;
  range: () => Chain;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Chain;
  then: (resolve: (resultado: Resultado) => void) => void;
};

const { createClientMock, respostas, tabelasConsultadas, ordens, contagens } = vi.hoisted(() => {
  const respostas = new Map<string, unknown[]>();
  const tabelasConsultadas: string[] = [];
  const ordens: Ordem[] = [];
  const contagens = new Map<string, string | undefined>();

  const createClientMock = vi.fn(async () => ({
    from(tabela: string) {
      tabelasConsultadas.push(tabela);
      const chain: Chain = {
        select: (_colunas, opcoes) => {
          contagens.set(tabela, opcoes?.count);
          return chain;
        },
        eq: () => chain,
        not: () => chain,
        is: () => chain,
        gte: () => chain,
        lte: () => chain,
        range: () => chain,
        order: (coluna, opcoes) => {
          ordens.push({ tabela, coluna, ascending: opcoes?.ascending });
          return chain;
        },
        then: (resolve) =>
          resolve({ data: respostas.get(tabela) ?? [], error: null, count: 0 }),
      };
      return chain;
    },
  }));

  return { createClientMock, respostas, tabelasConsultadas, ordens, contagens };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const { getColetas, getFilterOptions, montarSelectDeColetas, __limparCacheDeReferencias } =
  await import("./queries");

const contar = (tabela: string) => tabelasConsultadas.filter((t) => t === tabela).length;

beforeEach(() => {
  __limparCacheDeReferencias();
  respostas.clear();
  tabelasConsultadas.length = 0;
  ordens.length = 0;
  contagens.clear();
});

describe("getFilterOptions", () => {
  /**
   * A policy de `profiles` (migration 0006) devolve a operacao inteira para
   * gestao e so a propria linha para os demais. Se essa lista entrar no cache
   * compartilhado, o operador seguinte recebe o quadro inteiro -- RLS
   * contornado sem nenhum erro aparecer.
   */
  it("nao reaproveita a lista de funcionarios entre usuarios diferentes", async () => {
    respostas.set("profiles", [
      { id: "u1", nome_completo: "Gestor" },
      { id: "u2", nome_completo: "Operador" },
    ]);
    const comoGestor = await getFilterOptions();
    expect(comoGestor.funcionarios).toHaveLength(2);

    // Mesmo processo, dentro do TTL, mas outro usuario: o RLS devolve menos.
    respostas.set("profiles", [{ id: "u2", nome_completo: "Operador" }]);
    const comoOperador = await getFilterOptions();

    expect(comoOperador.funcionarios).toEqual([{ value: "u2", label: "Operador" }]);
    expect(contar("profiles")).toBe(2);
  });

  it("mantem em cache as tabelas de referencia, iguais para todo usuario ativo", async () => {
    await getFilterOptions();
    await getFilterOptions();

    expect(contar("sites")).toBe(1);
    expect(contar("eventos")).toBe(1);
    expect(contar("qr_codes")).toBe(1);
  });
});

describe("montarSelectDeColetas", () => {
  it("sem filtro de visita ou site, nenhum embed vira inner", () => {
    const select = montarSelectDeColetas(false, false);

    expect(select).not.toContain("!inner");
  });

  it("filtro de visita nao transforma o embed de site em inner", () => {
    const select = montarSelectDeColetas(true, false);

    expect(select).toContain("visitas!inner");
    expect(select).toContain("sites ( nome )");
    expect(select).not.toContain("sites!inner");
  });

  it("filtro de site torna inner os dois niveis, senao o de cima nao filtra", () => {
    const select = montarSelectDeColetas(true, true);

    expect(select).toContain("visitas!inner");
    expect(select).toContain("sites!inner");
  });
});

describe("getColetas", () => {
  /**
   * `data_hora` so e unico junto de (visita_id, area_id) -- migration 0004.
   * Leituras empatadas ficam sem ordem definida, e como cada pagina e uma
   * consulta nova, a mesma linha pode aparecer duas vezes e outra sumir.
   */
  it("desempata a ordenacao por id", async () => {
    await getColetas({ pagina: 1 });

    expect(ordens).toEqual([
      { tabela: "leituras", coluna: "data_hora", ascending: false },
      { tabela: "leituras", coluna: "id", ascending: false },
    ]);
  });

  /**
   * `leituras` e a tabela que mais cresce; contar exato varre tudo a cada
   * troca de pagina. A tela marca esse total com "~" (ver `totalAproximado`),
   * entao trocar de volta para exato aqui deixaria a interface pedindo
   * desculpa por uma imprecisao que nao existe mais.
   */
  it("conta por estimativa, nao exato", async () => {
    await getColetas({ pagina: 1 });

    expect(contagens.get("leituras")).toBe("estimated");
  });
});
