import { beforeEach, describe, expect, it, vi } from "vitest";

// O calculo das horas (par Inicio/Termino, duracao positiva, filtro de
// checkpoint em qualquer leitura da visita) desceu para o banco na 0049 e e
// testado la: supabase/tests/database/relatorios_agregados_no_banco_test.sql.

const { rpcMock, perfisMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), perfisMock: vi.fn() }));

/** `from("profiles").select().eq()...order()` resolve na propria cadeia. */
function cadeiaDePerfis() {
  const cadeia = {
    select: () => cadeia,
    eq: (coluna: string, valor: unknown) => {
      perfisMock(coluna, valor);
      return cadeia;
    },
    order: () => cadeia,
    then: (resolver: (valor: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "f1", nome_completo: "Eric" }, { id: "f2", nome_completo: "Ana" }], error: null }).then(
        resolver,
      ),
  };
  return cadeia;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => cadeiaDePerfis(), rpc: rpcMock }),
}));

const { extrairFiltros, formatarDuracao, formatarMedia, getHorasPorUsuario, juntarHorasAosPerfis } = await import(
  "./queries"
);

beforeEach(() => {
  rpcMock.mockReset();
  perfisMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
});

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-18",
        coletor_dados: "1",
        funcionario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
        checkpoint: "3",
        grupo_usuario: "2",
        sites: "5",
        local: "6",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-18",
      coletorDados: "1",
      funcionario: "e75fb18e-35e4-4a7f-82ec-7ec3b2fed0a3",
      checkpoint: "3",
      grupoUsuario: "2",
      sites: "5",
      local: "6",
    });
  });
});

describe("formatarDuracao", () => {
  it("formata HH:MM:SS, sem teto em 24h", () => {
    // 39:58:52, do exemplo real (Manasses Almeida Ferreira).
    const ms = ((39 * 60 + 58) * 60 + 52) * 1000;
    expect(formatarDuracao(ms)).toBe("39:58:52");
  });
});

describe("formatarMedia", () => {
  it("reproduz os 4 exemplos reais exatamente", () => {
    // Eric: 13:56:02 (50162s) / 18 visitas.
    expect(formatarMedia(50162 * 1000, 18)).toBe("00:46:26.7777");
    // Gesiel: 03:32:25 (12745s) / 2 visitas.
    expect(formatarMedia(12745 * 1000, 2)).toBe("01:46:12.5000");
    // Manasses: 39:58:52 (143932s) / 22 visitas.
    expect(formatarMedia(143932 * 1000, 22)).toBe("01:49:02.3636");
    // Odair: 13:47:29 (49649s) / 19 visitas.
    expect(formatarMedia(49649 * 1000, 19)).toBe("00:43:33.1052");
  });

  it("sem visitas, devolve '0' em vez de dividir por zero", () => {
    expect(formatarMedia(0, 0)).toBe("0");
  });
});

describe("juntarHorasAosPerfis", () => {
  const profilesBase = [
    { id: "f1", nome_completo: "Eric" },
    { id: "f2", nome_completo: "Ana" },
  ];

  it("usa a soma e a contagem que o banco devolveu", () => {
    const eric = juntarHorasAosPerfis(profilesBase, [{ funcionario_id: "f1", total_ms: 4_507_000, visitas: 2 }]).find(
      (l) => l.funcionarioId === "f1",
    )!;

    expect(eric).toEqual({ funcionarioId: "f1", nome: "Eric", totalMs: 4_507_000, visitas: 2 });
  });

  it("todo funcionario de profilesBase aparece, mesmo sem linha no banco", () => {
    const linhas = juntarHorasAosPerfis(profilesBase, []);

    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.totalMs === 0 && l.visitas === 0)).toBe(true);
  });

  it("funcionario que o banco devolveu mas nao esta na base (inativo) nao vira linha", () => {
    const linhas = juntarHorasAosPerfis(profilesBase, [{ funcionario_id: "inativo", total_ms: 1, visitas: 1 }]);

    expect(linhas.map((l) => l.funcionarioId).sort()).toEqual(["f1", "f2"]);
  });

  it("ordena as linhas por nome", () => {
    expect(juntarHorasAosPerfis(profilesBase, []).map((l) => l.nome)).toEqual(["Ana", "Eric"]);
  });
});

describe("getHorasPorUsuario", () => {
  it("sem periodo completo, nao consulta nada", async () => {
    expect(await getHorasPorUsuario({ dataInicial: "2026-08-01" })).toBeNull();
    expect(await getHorasPorUsuario({ dataInicial: "2026-08-31", dataFinal: "2026-08-01" })).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("dia final inclusivo vira periodo meio-aberto, e Local vira `site`", async () => {
    await getHorasPorUsuario({ dataInicial: "2026-08-01", dataFinal: "2026-08-31", local: "6", checkpoint: "3" });

    expect(rpcMock).toHaveBeenCalledWith("relatorio_horas_por_usuario", {
      p_inicio: "2026-08-01T00:00:00-03:00",
      p_fim: "2026-09-01T00:00:00-03:00",
      p_filtros: { site: "6", checkpoint: "3" },
    });
  });

  it("Sites sozinho tambem vira `site`", async () => {
    await getHorasPorUsuario({ dataInicial: "2026-08-01", dataFinal: "2026-08-01", sites: "5" });

    expect(rpcMock.mock.calls[0][1].p_filtros).toEqual({ site: "5" });
  });

  it("Local e Sites diferentes nao casam visita nenhuma -- nem chega a consultar horas", async () => {
    const linhas = await getHorasPorUsuario({ dataInicial: "2026-08-01", dataFinal: "2026-08-01", sites: "5", local: "6" });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(linhas?.every((l) => l.visitas === 0)).toBe(true);
  });

  it("filtro de funcionario recorta tambem a lista de perfis", async () => {
    await getHorasPorUsuario({ dataInicial: "2026-08-01", dataFinal: "2026-08-01", funcionario: "f1" });

    expect(perfisMock).toHaveBeenCalledWith("id", "f1");
  });

  it("erro da RPC sobe, em vez de mostrar todo mundo zerado", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(getHorasPorUsuario({ dataInicial: "2026-08-01", dataFinal: "2026-08-01" })).rejects.toEqual({
      message: "permission denied",
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
