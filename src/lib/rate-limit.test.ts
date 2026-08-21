import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identificarChamador, limitarTaxa } from "./rate-limit";

describe("limitarTaxa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite ate o limite dentro da janela", () => {
    const chave = "teste:permite";
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
    expect(limitarTaxa(chave, 3, 60_000)).toEqual({ permitido: true });
  });

  it("recusa a partir da requisicao que excede o limite", () => {
    const chave = "teste:recusa";
    limitarTaxa(chave, 2, 60_000);
    limitarTaxa(chave, 2, 60_000);

    const resultado = limitarTaxa(chave, 2, 60_000);

    expect(resultado.permitido).toBe(false);
  });

  it("informa quantos segundos faltam para a janela reabrir", () => {
    const chave = "teste:retry-after";
    limitarTaxa(chave, 1, 30_000);

    const resultado = limitarTaxa(chave, 1, 30_000);

    expect(resultado).toEqual({ permitido: false, tenteNovamenteEmSegundos: 30 });
  });

  it("libera de novo depois que a janela expira", () => {
    const chave = "teste:expira";
    limitarTaxa(chave, 1, 10_000);
    expect(limitarTaxa(chave, 1, 10_000).permitido).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(limitarTaxa(chave, 1, 10_000)).toEqual({ permitido: true });
  });

  it("chaves diferentes tem contadores independentes", () => {
    limitarTaxa("rota-a:1.2.3.4", 1, 60_000);

    expect(limitarTaxa("rota-a:1.2.3.4", 1, 60_000).permitido).toBe(false);
    expect(limitarTaxa("rota-b:1.2.3.4", 1, 60_000).permitido).toBe(true);
    expect(limitarTaxa("rota-a:5.6.7.8", 1, 60_000).permitido).toBe(true);
  });
});

describe("identificarChamador", () => {
  /** Um request com os headers que interessam, e null para o resto. */
  const requestCom = (headers: Record<string, string>) => ({
    headers: { get: (nome: string) => headers[nome] ?? null },
  });

  it("prefere x-real-ip, que o proxy escreve e nao e uma cadeia", () => {
    const request = requestCom({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.9",
    });

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  it("remove espaco ao redor do endereco", () => {
    const request = requestCom({ "x-real-ip": "  203.0.113.9  " });

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  /**
   * O achado da auditoria de 2026-08-18, virado teste.
   *
   * Cada proxy acrescenta ao FIM da cadeia, entao o item mais a esquerda e o
   * que o cliente mandou -- e ele pode mandar o que quiser. Usando o primeiro,
   * bastava trocar esse valor a cada requisicao para ganhar um balde novo e
   * nunca esbarrar no limite.
   */
  it("usa o ultimo endereco de x-forwarded-for, nao o primeiro", () => {
    const request = requestCom({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" });

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  it("nao deixa o chamador escolher a propria chave forjando x-forwarded-for", () => {
    const proxy = "203.0.113.9";

    // Duas requisicoes do mesmo cliente, cada uma inventando um prefixo
    // diferente. O que o proxy anexou no fim e o mesmo nas duas.
    const primeira = identificarChamador(requestCom({ "x-forwarded-for": `9.9.9.9, ${proxy}` }));
    const segunda = identificarChamador(requestCom({ "x-forwarded-for": `8.8.8.8, ${proxy}` }));

    expect(primeira).toBe(segunda);
  });

  it("aceita x-forwarded-for com um endereco so, sem proxy encadeado", () => {
    const request = requestCom({ "x-forwarded-for": "203.0.113.9" });

    expect(identificarChamador(request)).toBe("203.0.113.9");
  });

  it("cai numa chave fixa quando nenhum dos dois headers existe", () => {
    expect(identificarChamador(requestCom({}))).toBe("sem-ip");
  });

  it("cai numa chave fixa quando o header existe mas vem vazio", () => {
    expect(identificarChamador(requestCom({ "x-forwarded-for": " , " }))).toBe("sem-ip");
  });
});
