import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));
vi.mock("@/lib/log", () => ({ erro: vi.fn(), gerarIdDeRequisicao: () => "teste" }));

const { extrairFiltros, formatarDuracao, getRegistroDeRondas, montarLinhas, paraLinhaDeExportacao } = await import(
  "./queries"
);

/** O que `.rpc()` devolve: encadeia `.order()` e resolve no `.range()`, como o
 * builder do PostgREST que `buscarEmPaginas` usa. */
function construtor(data: unknown, error: unknown = null) {
  const builder = {
    order: () => builder,
    range: () => Promise.resolve({ data, error }),
  };
  return builder;
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("extrairFiltros", () => {
  it("le mes e os filtros de detalhe da querystring", () => {
    expect(extrairFiltros({ mes: "2026-08", local: "3", atividade: "9", grupo_usuario: "2" })).toEqual({
      mes: "2026-08",
      local: "3",
      coletorDados: undefined,
      funcionario: undefined,
      area: undefined,
      evento: undefined,
      qualificador: undefined,
      checkpoint: undefined,
      atividade: "9",
      grupoSite: undefined,
      grupoUsuario: "2",
      motivo: undefined,
    });
  });

  it("cai no mes atual para valor ausente ou fora do formato yyyy-mm", () => {
    const mesAtual = extrairFiltros({}).mes;
    expect(mesAtual).toMatch(/^\d{4}-\d{2}$/);
    expect(extrairFiltros({ mes: "2026-13" }).mes).toBe(mesAtual);
  });
});

describe("formatarDuracao", () => {
  it("formata HH:MM:SS com zero a esquerda", () => {
    expect(formatarDuracao(65 * 1000)).toBe("00:01:05");
  });

  it("nao limita horas em 24 -- soma literal de segundos", () => {
    // 32h03m31s, como no exemplo real (Total de "32:03:31").
    const ms = ((32 * 60 + 3) * 60 + 31) * 1000;
    expect(formatarDuracao(ms)).toBe("32:03:31");
  });
});

// O agrupamento de leituras em rondas (par Inicio/Termino, dia em -03:00,
// filtros de detalhe na mesma leitura) desceu para o banco na 0049 e e testado
// la: supabase/tests/database/relatorios_agregados_no_banco_test.sql. Aqui fica
// o que continua no TypeScript.

describe("montarLinhas", () => {
  it("espalha as duracoes na coluna do dia e soma o Total", () => {
    const linhas = montarLinhas([{ site_id: 10, site_nome: "ACE Limpeza", dia: 8, duracoes_ms: [2_707_000] }]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].siteNome).toBe("ACE Limpeza");
    expect(linhas[0].duracoesPorDia[7]).toEqual([2_707_000]); // dia 8 -> indice 7
    expect(linhas[0].totalMs).toBe(2_707_000);
  });

  it("junta dias diferentes do mesmo Local numa linha so", () => {
    const linhas = montarLinhas([
      { site_id: 10, site_nome: "Campos do Conde", dia: 11, duracoes_ms: [7_369_000, 2_000_000] },
      { site_id: 10, site_nome: "Campos do Conde", dia: 12, duracoes_ms: [60_000] },
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].duracoesPorDia[10]).toEqual([7_369_000, 2_000_000]);
    expect(linhas[0].duracoesPorDia[11]).toEqual([60_000]);
    expect(linhas[0].totalMs).toBe(9_429_000);
  });

  it("sem linha do banco, sem linha na tela", () => {
    expect(montarLinhas([])).toEqual([]);
  });

  it("ordena por nome do Local em pt-BR, nao pela ordem que o banco devolveu", () => {
    const linhas = montarLinhas([
      { site_id: 20, site_nome: "Zeta", dia: 1, duracoes_ms: [1] },
      { site_id: 30, site_nome: "Água Branca", dia: 1, duracoes_ms: [1] },
      { site_id: 10, site_nome: "Alfa", dia: 1, duracoes_ms: [1] },
    ]);

    expect(linhas.map((l) => l.siteNome)).toEqual(["Água Branca", "Alfa", "Zeta"]);
  });
});

describe("getRegistroDeRondas", () => {
  it("manda o mes como periodo meio-aberto e so os filtros escolhidos", async () => {
    rpcMock.mockReturnValue(construtor([]));

    await getRegistroDeRondas({ mes: "2026-12", local: "3", evento: "5", area: "" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_registro_de_rondas", {
      p_inicio: "2026-12-01T00:00:00-03:00",
      p_fim: "2027-01-01T00:00:00-03:00",
      p_filtros: { site: "3", evento: "5" },
    });
  });

  it("monta a grade a partir do que a RPC devolveu", async () => {
    rpcMock
      .mockReturnValueOnce(construtor([{ site_id: 1, site_nome: "Loja", dia: 2, duracoes_ms: [1000] }]))
      .mockReturnValueOnce(construtor([]));

    const linhas = await getRegistroDeRondas({ mes: "2026-08" });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].duracoesPorDia[1]).toEqual([1000]);
  });

  it("erro da RPC sobe, em vez de virar 'nenhuma ronda'", async () => {
    rpcMock.mockReturnValue(construtor(null, { message: "permission denied" }));

    await expect(getRegistroDeRondas({ mes: "2026-08" })).rejects.toEqual({ message: "permission denied" });
  });
});

describe("paraLinhaDeExportacao", () => {
  it("junta mais de uma duracao no mesmo dia com quebra de linha, e preenche dias vazios com celula vazia", () => {
    const linha = {
      siteId: 10,
      siteNome: "ACE Limpeza",
      duracoesPorDia: Array.from({ length: 31 }, (_, i) => (i === 3 ? [90000, 60000] : [])),
      totalMs: 150000,
    };

    const colunas = paraLinhaDeExportacao(linha);

    expect(colunas[0]).toBe("ACE Limpeza");
    expect(colunas[4]).toBe("00:01:30\n00:01:00"); // dia 4 -> indice 4 na saida (Local + 31 dias)
    expect(colunas[1]).toBe("");
    expect(colunas[colunas.length - 1]).toBe("00:02:30");
  });
});
