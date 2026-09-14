import { beforeEach, describe, expect, it, vi } from "vitest";

// O agrupamento por visita (par Inicio/Termino, evento de qualquer leitura,
// filtros de detalhe na mesma leitura) desceu para o banco na 0049:
// supabase/tests/database/relatorios_agregados_no_banco_test.sql.

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: rpcMock }) }));

const { extrairFiltros, formatarDuracao, getInspecoesComInicioEFim, paraLinhaDeInspecao } = await import("./queries");

/** Builder de `.rpc()`: encadeia `.order()` e resolve no `.range()`. */
function construtor(data: unknown, error: unknown = null) {
  const builder = { order: () => builder, range: () => Promise.resolve({ data, error }) };
  return builder;
}

const doBanco = {
  visita_id: 1,
  inicio: "2026-08-11T10:27:33+00:00",
  termino: "2026-08-11T12:48:10+00:00",
  duracao_ms: 8_437_000,
  usuario: "Manassés Almeida Ferreira",
  regional: "SP",
  site: "Portal das Estrelas",
  evento: "Ocorrência",
};

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockReturnValue(construtor([]));
});

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-11",
        evento: "1",
        atividade: "2",
        motivo: "3",
        funcionario: "abc",
        grupo_site: "4",
        sites: "5",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-11",
      evento: "1",
      atividade: "2",
      motivo: "3",
      funcionario: "abc",
      grupoSite: "4",
      sites: "5",
    });
  });
});

describe("formatarDuracao", () => {
  it("reproduz o exemplo real: 09:48:10 - 07:27:33 = 02:20:37", () => {
    const inicio = new Date("2026-08-11T07:27:33-03:00").getTime();
    const termino = new Date("2026-08-11T09:48:10-03:00").getTime();
    expect(formatarDuracao(termino - inicio)).toBe("02:20:37");
  });
});

describe("paraLinhaDeInspecao", () => {
  it("renomeia a linha do banco para a forma da tela, sem recalcular nada", () => {
    expect(paraLinhaDeInspecao(doBanco)).toEqual({
      visitaId: 1,
      dataHoraInicio: "2026-08-11T10:27:33+00:00",
      dataHoraTermino: "2026-08-11T12:48:10+00:00",
      duracaoMs: 8_437_000,
      usuario: "Manassés Almeida Ferreira",
      regional: "SP",
      site: "Portal das Estrelas",
      evento: "Ocorrência",
    });
  });
});

describe("getInspecoesComInicioEFim", () => {
  it("sem periodo completo, nao consulta nada", async () => {
    expect(await getInspecoesComInicioEFim({ dataFinal: "2026-08-11" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("manda periodo meio-aberto e traduz Sites e Atividades", async () => {
    await getInspecoesComInicioEFim({ dataInicial: "2026-08-11", dataFinal: "2026-08-11", sites: "5", atividade: "2" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_inspecoes_inicio_fim", {
      p_inicio: "2026-08-11T00:00:00-03:00",
      p_fim: "2026-08-12T00:00:00-03:00",
      p_filtros: { site: "5", atividade: "2" },
    });
  });

  it("junta as paginas e nao marca truncado abaixo do teto", async () => {
    rpcMock.mockReturnValueOnce(construtor([doBanco])).mockReturnValueOnce(construtor([]));

    const resultado = await getInspecoesComInicioEFim({ dataInicial: "2026-08-11", dataFinal: "2026-08-11" });

    expect(resultado?.linhas).toHaveLength(1);
    expect(resultado?.truncado).toBe(false);
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
