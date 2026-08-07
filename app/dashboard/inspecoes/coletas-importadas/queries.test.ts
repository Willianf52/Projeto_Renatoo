import { beforeEach, describe, expect, it, vi } from "vitest";

type Resultado = { data: unknown[]; error: null; count: number };
type Ordem = { tabela: string; coluna: string; ascending?: boolean };
type Range = { tabela: string; from: number; to: number };

/** Encadeamento minimo do query builder do Supabase: todo metodo devolve a si
 * mesmo e o objeto e "thenable", entao `await query` resolve o resultado. */
type Chain = {
  select: (colunas?: string, opcoes?: { count?: string }) => Chain;
  eq: () => Chain;
  not: () => Chain;
  is: () => Chain;
  gte: () => Chain;
  lte: () => Chain;
  range: (from: number, to: number) => Chain;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Chain;
  then: (resolve: (resultado: Resultado) => void) => void;
};

const { createClientMock, respostas, tabelasConsultadas, ordens, contagens, ranges } = vi.hoisted(
  () => {
    const respostas = new Map<string, unknown[]>();
    const tabelasConsultadas: string[] = [];
    const ordens: Ordem[] = [];
    const contagens = new Map<string, string | undefined>();
    const ranges: Range[] = [];

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
          range: (from, to) => {
            ranges.push({ tabela, from, to });
            return chain;
          },
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

    return { createClientMock, respostas, tabelasConsultadas, ordens, contagens, ranges };
  },
);

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

const {
  combinarDataHora,
  getColetas,
  getColetasParaExportar,
  getFilterOptions,
  montarSelectDeColetas,
  toTableRow,
  LIMITE_EXPORTACAO,
  __limparCacheDeReferencias,
} = await import("./queries");

const contar = (tabela: string) => tabelasConsultadas.filter((t) => t === tabela).length;

beforeEach(() => {
  __limparCacheDeReferencias();
  respostas.clear();
  tabelasConsultadas.length = 0;
  ordens.length = 0;
  contagens.clear();
  ranges.length = 0;
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

  it("mantem em cache as tabelas de referencia globais", async () => {
    await getFilterOptions();
    await getFilterOptions();

    // Sem recorte por usuario em policy nenhuma: a lista e a mesma para
    // qualquer usuario ativo, entao consultar de novo so gastaria round-trip.
    expect(contar("eventos")).toBe(1);
    expect(contar("areas")).toBe(1);
    expect(contar("tipos_servico")).toBe(1);
  });

  /**
   * `sites`, `grupos_sites` e `qr_codes` eram cacheadas aqui enquanto a policy
   * das tres era `usuario_ativo()` puro. A migration 0014 as passou para
   * `pode_ver_grupo_site(...)`, que recorta por grupo para quem tem nivel
   * CLIENTE -- e resultado recortado nao pode ser reaproveitado entre
   * usuarios: o primeiro gestor a abrir a tela deixaria a lista completa no
   * cache, e o cliente seguinte receberia os sites de todos os outros
   * clientes. E o vazamento que a 0014 existe para fechar.
   */
  it("nao reaproveita sites, grupos nem checkpoints entre usuarios diferentes", async () => {
    respostas.set("sites", [
      { id: 1, nome: "Agência Centro" },
      { id: 2, nome: "Loja Ipiranga" },
    ]);
    respostas.set("grupos_sites", [
      { id: 1, nome: "Cooplivre" },
      { id: 2, nome: "Bom Preço" },
    ]);
    respostas.set("qr_codes", [
      { id: 1, codigo: "QR-AGC-001" },
      { id: 2, codigo: "QR-LIP-001" },
    ]);

    const comoGestor = await getFilterOptions();
    expect(comoGestor.locais).toHaveLength(2);
    expect(comoGestor.gruposSites).toHaveLength(2);
    expect(comoGestor.checkpoints).toHaveLength(2);

    // Mesmo processo, dentro do TTL, mas um CLIENTE: o RLS devolve menos.
    respostas.set("sites", [{ id: 1, nome: "Agência Centro" }]);
    respostas.set("grupos_sites", [{ id: 1, nome: "Cooplivre" }]);
    respostas.set("qr_codes", [{ id: 1, codigo: "QR-AGC-001" }]);

    const comoCliente = await getFilterOptions();

    expect(comoCliente.locais).toEqual([{ value: "1", label: "Agência Centro" }]);
    expect(comoCliente.gruposSites).toEqual([{ value: "1", label: "Cooplivre" }]);
    expect(comoCliente.checkpoints).toEqual([{ value: "1", label: "QR-AGC-001" }]);

    expect(contar("sites")).toBe(2);
    expect(contar("grupos_sites")).toBe(2);
    expect(contar("qr_codes")).toBe(2);
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

describe("combinarDataHora", () => {
  /**
   * Sem o deslocamento explicito, o Postgres interpretaria o timestamp
   * conforme o fuso da conexao -- que pode nao ser o fuso operacional (ver
   * comentario da funcao).
   */
  it("adiciona o deslocamento de Brasilia ao combinar data e hora", () => {
    expect(combinarDataHora("2026-08-05", "14:30", "00:00:00")).toBe(
      "2026-08-05T14:30:00-03:00",
    );
  });

  it("usa a hora padrao quando so a data foi informada", () => {
    expect(combinarDataHora("2026-08-05", undefined, "23:59:59")).toBe(
      "2026-08-05T23:59:59-03:00",
    );
  });

  it("sem data, nao ha limite para aplicar", () => {
    expect(combinarDataHora(undefined, "14:30", "00:00:00")).toBeNull();
  });
});

describe("getColetasParaExportar", () => {
  it("pede LIMITE_EXPORTACAO + 1 linhas, para detectar truncamento sem um count a mais", async () => {
    await getColetasParaExportar({});

    expect(ranges).toContainEqual({ tabela: "leituras", from: 0, to: LIMITE_EXPORTACAO });
  });

  it("mantem o mesmo desempate por id da listagem paginada", async () => {
    await getColetasParaExportar({});

    expect(ordens).toEqual([
      { tabela: "leituras", coluna: "data_hora", ascending: false },
      { tabela: "leituras", coluna: "id", ascending: false },
    ]);
  });

  it("nao truncado quando o resultado cabe no limite", async () => {
    respostas.set("leituras", [{ id: 1, data_hora: "2026-01-01T00:00:00Z", visitas: null }]);

    const { rows, truncado } = await getColetasParaExportar({});

    expect(rows).toHaveLength(1);
    expect(truncado).toBe(false);
  });

  it("truncado quando a consulta devolve um a mais que o limite", async () => {
    respostas.set(
      "leituras",
      Array.from({ length: LIMITE_EXPORTACAO + 1 }, (_, i) => ({
        id: i,
        data_hora: "2026-01-01T00:00:00Z",
        visitas: null,
      })),
    );

    const { rows, truncado } = await getColetasParaExportar({});

    expect(rows).toHaveLength(LIMITE_EXPORTACAO);
    expect(truncado).toBe(true);
  });
});

describe("toTableRow", () => {
  it("mapeia campos ausentes para string vazia, na ordem de TABLE_COLUMNS", () => {
    const linha = toTableRow({
      id: 1,
      data_hora: "2026-08-05T14:30:00-03:00",
      observacao: null,
      data_integracao: null,
      areas: null,
      eventos: null,
      acoes: null,
      qualificadores: null,
      qr_codes: null,
      visitas: null,
    });

    expect(linha).toHaveLength(11);
    expect(linha.every((campo) => campo === "" || typeof campo === "string")).toBe(true);
  });

  it("preenche a partir dos relacionamentos quando presentes", () => {
    const linha = toTableRow({
      id: 1,
      data_hora: "2026-08-05T14:30:00-03:00",
      observacao: "Portão trancado",
      data_integracao: null,
      areas: { nome: "Início" },
      eventos: null,
      acoes: null,
      qualificadores: null,
      qr_codes: null,
      visitas: {
        numero_coleta: 42,
        profiles: { nome_completo: "Ana" },
        coletores_dados: { nome: "Dispositivo Móvel" },
        sites: { nome: "Cooplivre" },
      },
    });

    expect(linha[0]).toBe("42");
    expect(linha[2]).toBe("Dispositivo Móvel");
    expect(linha[3]).toBe("Ana");
    expect(linha[4]).toBe("Cooplivre");
    expect(linha[5]).toBe("Início");
    expect(linha[7]).toBe("Portão trancado");
  });
});
