import { describe, expect, it } from "vitest";
import { filtrosParaRpc } from "./relatorios";

describe("filtrosParaRpc", () => {
  it("mantem so os filtros escolhidos", () => {
    expect(filtrosParaRpc({ site: "3", evento: undefined, funcionario: "abc" })).toEqual({
      site: "3",
      funcionario: "abc",
    });
  });

  it("select vazio ou so espaco fica de fora, em vez de ir como chave presente", () => {
    expect(filtrosParaRpc({ site: "", evento: "  " })).toEqual({});
  });
});
