import { beforeEach, describe, expect, it, vi } from "vitest";

// A contagem de visitas distintas por funcionario (uma visita com Inicio e
// Termino conta uma vez; checkpoint em qualquer leitura) desceu para o banco
// na 0049: supabase/tests/database/relatorios_agregados_no_banco_test.sql.

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));

const { extrairFiltros, getRankingDeInspecoes, ordenarRanking } = await import("./queries");

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
});

const linha = (funcionarioId: string, nome: string, quantidade: number) => ({
  funcionario_id: funcionarioId,
  nome,
  quantidade,
});

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-11",
        checkpoint: "3",
        funcionario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
        grupo_usuario: "2",
        tipo: "1",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-11",
      checkpoint: "3",
      funcionario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
      grupoUsuario: "2",
      tipo: "1",
    });
  });

  it("filtros ausentes ficam undefined, sem mes/data padrao", () => {
    expect(extrairFiltros({})).toEqual({
      dataInicial: undefined,
      dataFinal: undefined,
      checkpoint: undefined,
      funcionario: undefined,
      grupoUsuario: undefined,
      tipo: undefined,
    });
  });
});

describe("ordenarRanking", () => {
  it("reproduz o exemplo real: 7+4+3+2+2+1 = 19, do maior para o menor", () => {
    const ranking = ordenarRanking([
      linha("marcia", "Márcia Nascimento", 1),
      linha("gesiel", "Gesiel", 2),
      linha("eric", "Eric", 7),
      linha("manasses", "Manassés Almeida Ferreira", 3),
      linha("karina", "Karina Gomes", 2),
      linha("odair", "Odair Viana Lima", 4),
    ]);

    expect(ranking.itens.map((item) => item.quantidade)).toEqual([7, 4, 3, 2, 2, 1]);
    expect(ranking.total).toBe(19);
  });

  it("empate em quantidade desempata por nome em pt-BR", () => {
    const ranking = ordenarRanking([linha("z", "Zeta", 2), linha("a", "Álvaro", 2), linha("b", "Beto", 2)]);

    expect(ranking.itens.map((item) => item.nome)).toEqual(["Álvaro", "Beto", "Zeta"]);
  });

  it("sem linha do banco, ranking vazio e total zero", () => {
    expect(ordenarRanking([])).toEqual({ itens: [], total: 0 });
  });
});

describe("getRankingDeInspecoes", () => {
  it("sem periodo informado devolve null, sem consultar o banco", async () => {
    expect(await getRankingDeInspecoes({})).toBeNull();
    expect(await getRankingDeInspecoes({ dataInicial: "2026-08-01" })).toBeNull();
    expect(await getRankingDeInspecoes({ dataFinal: "2026-08-31" })).toBeNull();
    expect(await getRankingDeInspecoes({ dataInicial: "2026-08-31", dataFinal: "2026-08-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda o periodo meio-aberto e traduz Tipo para `tipo_servico`", async () => {
    await getRankingDeInspecoes({ dataInicial: "2026-08-01", dataFinal: "2026-08-31", tipo: "1", checkpoint: "" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_ranking_de_inspecoes", {
      p_inicio: "2026-08-01T00:00:00-03:00",
      p_fim: "2026-09-01T00:00:00-03:00",
      p_filtros: { tipo_servico: "1" },
    });
  });

  it("erro da RPC sobe, em vez de virar ranking vazio", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "timeout" } });

    await expect(getRankingDeInspecoes({ dataInicial: "2026-08-01", dataFinal: "2026-08-31" })).rejects.toEqual({
      message: "timeout",
    });
  });
});

describe("periodo torto na querystring", () => {
  it("descarta data que nao existe em vez de interpolar no limite da consulta", () => {
    // O limite vira literal de timestamptz por interpolacao, entao `abc`
    // chegaria ao Postgres como `abcT00:00:00-03:00` (erro 22007). Descartado,
    // o periodo fica incompleto e a tela pede um periodo em vez de quebrar.
    const filtros = extrairFiltros({ data_inicial: "abc", data_final: "2026-02-31" });

    expect(filtros.dataInicial).toBeUndefined();
    expect(filtros.dataFinal).toBeUndefined();
  });
});
