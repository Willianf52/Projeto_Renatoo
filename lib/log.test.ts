import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erro, gerarIdDeRequisicao } from "./log";

describe("gerarIdDeRequisicao", () => {
  it("gera ids diferentes a cada chamada", () => {
    expect(gerarIdDeRequisicao()).not.toBe(gerarIdDeRequisicao());
  });
});

describe("erro", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("prefixa a mensagem com o id, para agrupar linhas da mesma requisicao", () => {
    erro("abc123", "Falha ao consultar o perfil.");

    expect(spy).toHaveBeenCalledWith("[abc123] Falha ao consultar o perfil.");
  });

  it("repassa o detalhe quando informado", () => {
    erro("abc123", "Falha ao consultar o perfil.", "conexão perdida");

    expect(spy).toHaveBeenCalledWith("[abc123] Falha ao consultar o perfil.", "conexão perdida");
  });
});
