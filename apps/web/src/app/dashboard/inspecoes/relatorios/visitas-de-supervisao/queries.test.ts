import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { metodo: string; args: unknown[] };
type Resposta = { data: unknown; error: { message: string } | null };

/**
 * Duas fontes mockadas: `.from(tabela)` (sites e metas_visitas), cada uma com
 * sua resposta e lista de chamadas, e `.rpc()` (as visitas, desde a 0049), que
 * devolve uma pagina por chamada da fila `respostasRpc` e resolve no
 * `.range()` -- o formato que `buscarEmPaginas` consome.
 */
const { createClientMock, rpcMock, erroMock, respostas, chamadasPorTabela, respostasRpc, erroDaRpc } = vi.hoisted(
  () => {
    const respostas = new Map<string, Resposta>();
    const chamadasPorTabela = new Map<string, Chamada[]>();
    const respostasRpc: unknown[][] = [];
    const erroDaRpc: { valor: { message: string } | null } = { valor: null };
    const erroMock = vi.fn();

    const rpcMock = vi.fn(() => {
      const builder = {
        order: () => builder,
        range: () =>
          Promise.resolve(
            erroDaRpc.valor ? { data: null, error: erroDaRpc.valor } : { data: respostasRpc.shift() ?? [], error: null },
          ),
      };
      return builder;
    });

    const createClientMock = vi.fn(async () => ({
      rpc: rpcMock,
      from(tabela: string) {
        const chamadas: Chamada[] = chamadasPorTabela.get(tabela) ?? [];
        chamadasPorTabela.set(tabela, chamadas);

        const chain: Record<string, unknown> = {};
        for (const metodo of ["select", "eq", "gte", "lt", "order"]) {
          chain[metodo] = (...args: unknown[]) => {
            chamadas.push({ metodo, args });
            return chain;
          };
        }
        chain.maybeSingle = (...args: unknown[]) => {
          chamadas.push({ metodo: "maybeSingle", args });
          return Promise.resolve(respostas.get(tabela) ?? { data: null, error: null });
        };
        chain.then = (resolve: (resultado: Resposta) => void) => resolve(respostas.get(tabela) ?? { data: [], error: null });

        return chain;
      },
    }));

    return { createClientMock, rpcMock, erroMock, respostas, chamadasPorTabela, respostasRpc, erroDaRpc };
  },
);

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/log", () => ({ erro: erroMock, gerarIdDeRequisicao: () => "id-teste" }));

const { extrairFiltros, getHistoricoDeSupervisao, getOpcoesSites } = await import("./queries");

beforeEach(() => {
  respostas.clear();
  chamadasPorTabela.clear();
  respostasRpc.length = 0;
  erroDaRpc.valor = null;
  erroMock.mockClear();
  rpcMock.mockClear();
});

function visita(visitaId: number, dataHora: string, extra: Record<string, unknown> = {}) {
  return {
    visita_id: visitaId,
    data_hora: dataHora,
    funcionario: "Odair Viana Lima",
    local: "ACE Limpeza",
    tem_localizacao: false,
    motivo_visita: "Inspeção",
    observacao: "",
    ...extra,
  };
}

describe("extrairFiltros", () => {
  it("le mes e site da querystring", () => {
    expect(extrairFiltros({ mes: "2026-08", site: "7" })).toEqual({ mes: "2026-08", site: "7" });
  });

  it("cai no mes atual para valor ausente ou fora do formato yyyy-mm", () => {
    const mesAtual = extrairFiltros({}).mes;
    expect(mesAtual).toMatch(/^\d{4}-\d{2}$/);
    expect(extrairFiltros({ mes: "agosto/2026" }).mes).toBe(mesAtual);
    expect(extrairFiltros({ mes: "2026-13" }).mes).toBe(mesAtual);
  });

  it("site fica ausente quando nao vem na querystring", () => {
    expect(extrairFiltros({}).site).toBeUndefined();
  });
});

describe("getOpcoesSites", () => {
  it("prefixa com o grupo quando o site tem um", async () => {
    respostas.set("sites", {
      data: [
        { id: 1, nome: "ACE Limpeza", grupos_sites: { nome: "UP Serviços" } },
        { id: 2, nome: "Sem Grupo", grupos_sites: null },
      ],
      error: null,
    });

    const opcoes = await getOpcoesSites();

    expect(opcoes).toEqual([
      { value: "1", label: "UP Serviços - ACE Limpeza" },
      { value: "2", label: "Sem Grupo" },
    ]);
  });

  it("loga a falha e devolve lista vazia em vez de estourar, quando a consulta falha", async () => {
    respostas.set("sites", { data: null, error: { message: "conexão recusada" } });

    const opcoes = await getOpcoesSites();

    expect(opcoes).toEqual([]);
    expect(erroMock).toHaveBeenCalledWith(
      "id-teste",
      "Falha ao carregar sites para o filtro de visitas de supervisão:",
      "conexão recusada",
    );
  });
});

describe("getHistoricoDeSupervisao", () => {
  // O agrupamento por visita (data mais antiga; localizacao e observacao de
  // qualquer leitura) desceu para o banco na 0049:
  // supabase/tests/database/relatorios_agregados_no_banco_test.sql.

  it("uma linha por visita vinda do banco, e Realizado e a quantidade delas", async () => {
    respostasRpc.push(
      [visita(10, "2026-08-08T09:45:00Z", { tem_localizacao: true, observacao: "Portão trancado" }), visita(11, "2026-08-04T12:40:00Z")],
      [],
    );

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.realizado).toBe(2);
    expect(historico.visitas[0]).toEqual({
      visitaId: 10,
      dataHora: "2026-08-08T09:45:00Z",
      funcionario: "Odair Viana Lima",
      local: "ACE Limpeza",
      temLocalizacao: true,
      motivoVisita: "Inspeção",
      observacao: "Portão trancado",
    });
  });

  it("manda o site e o mes como periodo meio-aberto", async () => {
    await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_visitas_de_supervisao", {
      p_site: 3,
      p_inicio: "2026-08-01T00:00:00-03:00",
      p_fim: "2026-09-01T00:00:00-03:00",
    });
  });

  it("meta nula (sem linha em metas_visitas, ou usuario sem acesso a ela) vira null, nao erro", async () => {
    respostasRpc.push([visita(30, "2026-08-08T09:45:00Z")], []);
    // metas_visitas sem resposta configurada -> maybeSingle devolve data: null.

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.meta).toBeNull();
    expect(historico.realizado).toBe(1);
  });

  it("meta presente vem de metas_visitas.quantidade_esperada", async () => {
    respostas.set("metas_visitas", { data: { quantidade_esperada: 5 }, error: null });

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.meta).toBe(5);
    expect(historico.realizado).toBe(0);
  });

  it("consulta metas_visitas pelo site e pelo primeiro dia do mes (competencia)", async () => {
    await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    const chamadas = chamadasPorTabela.get("metas_visitas") ?? [];
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["site_id", 3] });
    expect(chamadas).toContainEqual({ metodo: "eq", args: ["competencia", "2026-08-01"] });
  });

  it("loga a falha das visitas e segue com lista vazia, em vez de confundir com 'sem visita'", async () => {
    erroDaRpc.valor = { message: "RLS inesperado" };

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.visitas).toEqual([]);
    expect(erroMock).toHaveBeenCalledWith(
      "id-teste",
      "Falha ao carregar visitas para o histórico de visitas de supervisão:",
      "RLS inesperado",
    );
  });

  it("loga a falha de metas_visitas e segue com meta null", async () => {
    respostas.set("metas_visitas", { data: null, error: { message: "timeout" } });

    const historico = await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(historico.meta).toBeNull();
    expect(erroMock).toHaveBeenCalledWith("id-teste", "Falha ao carregar meta de visitas:", "timeout");
  });

  it("nao loga nada quando as duas consultas tem sucesso", async () => {
    await getHistoricoDeSupervisao({ mes: "2026-08", site: "3" });

    expect(erroMock).not.toHaveBeenCalled();
  });
});
