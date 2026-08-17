import { describe, expect, it } from "vitest";
import { contarPorFuncionario, extrairFiltros } from "./queries";

function leitura(visitaId: number, funcionarioId: string | null, nome: string) {
  return {
    visita_id: visitaId,
    visitas: funcionarioId ? { funcionario_id: funcionarioId, profiles: { nome_completo: nome } } : null,
  };
}

describe("extrairFiltros", () => {
  it("le todos os filtros da querystring", () => {
    expect(
      extrairFiltros({
        data_inicial: "2026-08-11",
        data_final: "2026-08-11",
        checkpoint: "3",
        funcionario: "abc",
        grupo_usuario: "2",
        tipo: "1",
      }),
    ).toEqual({
      dataInicial: "2026-08-11",
      dataFinal: "2026-08-11",
      checkpoint: "3",
      funcionario: "abc",
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

describe("contarPorFuncionario", () => {
  it("conta visitas distintas por funcionario e ordena do maior para o menor", () => {
    const leituras = [
      leitura(1, "f-eric", "Eric"),
      leitura(1, "f-eric", "Eric"), // mesma visita, segunda leitura (Termino) -- nao conta 2x
      leitura(2, "f-eric", "Eric"),
      leitura(3, "f-odair", "Odair Viana Lima"),
      leitura(4, "f-odair", "Odair Viana Lima"),
    ];

    const ranking = contarPorFuncionario(leituras);

    expect(ranking.itens).toEqual([
      { funcionarioId: "f-eric", nome: "Eric", quantidade: 2 },
      { funcionarioId: "f-odair", nome: "Odair Viana Lima", quantidade: 2 },
    ]);
    expect(ranking.total).toBe(4);
  });

  it("reproduz o exemplo real: 7+4+3+2+2+1 = 19, ordenado por quantidade", () => {
    const leituras = [
      ...Array.from({ length: 7 }, (_, i) => leitura(100 + i, "eric", "Eric")),
      ...Array.from({ length: 4 }, (_, i) => leitura(200 + i, "odair", "Odair Viana Lima")),
      ...Array.from({ length: 3 }, (_, i) => leitura(300 + i, "manasses", "Manassés Almeida Ferreira")),
      ...Array.from({ length: 2 }, (_, i) => leitura(400 + i, "gesiel", "Gesiel")),
      ...Array.from({ length: 2 }, (_, i) => leitura(500 + i, "karina", "Karina Gomes")),
      ...Array.from({ length: 1 }, (_, i) => leitura(600 + i, "marcia", "Márcia Nascimento")),
    ];

    const ranking = contarPorFuncionario(leituras);

    expect(ranking.itens.map((item) => item.quantidade)).toEqual([7, 4, 3, 2, 2, 1]);
    expect(ranking.total).toBe(19);
  });

  it("ignora leitura cuja visita nao tem funcionario", () => {
    const leituras = [leitura(1, null, "")];
    expect(contarPorFuncionario(leituras)).toEqual({ itens: [], total: 0 });
  });

  it("empate em quantidade desempata por nome", () => {
    const leituras = [leitura(1, "z", "Zeta"), leitura(2, "a", "Alfa")];
    expect(contarPorFuncionario(leituras).itens.map((item) => item.nome)).toEqual(["Alfa", "Zeta"]);
  });
});
