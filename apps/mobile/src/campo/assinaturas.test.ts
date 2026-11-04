import { describe, expect, it } from "vitest";

import {
  LIMITE_DO_NOME,
  QUANTIDADE_DE_ASSINATURAS,
  assinaturasQueFaltam,
  geometriaDaPrancheta,
  mensagemDaPendenciaDeAssinaturas,
  normalizarNome,
  pontoDoDesenho,
  problemaNoNome,
  tituloDaAssinatura,
} from "./assinaturas";

describe("nome de quem assina", () => {
  it("tira as pontas e junta os espacos repetidos", () => {
    expect(normalizarNome("  Willian   Souza ")).toBe("Willian Souza");
  });

  it("nome vazio ou so de espacos e recusado", () => {
    expect(problemaNoNome("")).toBe("Informe o nome de quem vai assinar.");
    expect(problemaNoNome("   ")).toBe("Informe o nome de quem vai assinar.");
  });

  it("o limite e o da coluna do banco", () => {
    expect(problemaNoNome("a".repeat(LIMITE_DO_NOME))).toBeNull();
    expect(problemaNoNome("a".repeat(LIMITE_DO_NOME + 1))).toContain(String(LIMITE_DO_NOME));
  });

  it("nome normal passa", () => {
    expect(problemaNoNome("Willian")).toBeNull();
  });
});

describe("quantas assinaturas", () => {
  it("sao duas", () => {
    expect(QUANTIDADE_DE_ASSINATURAS).toBe(2);
  });

  it("conta o que falta, sem passar de zero", () => {
    expect(assinaturasQueFaltam(0)).toBe(2);
    expect(assinaturasQueFaltam(1)).toBe(1);
    expect(assinaturasQueFaltam(2)).toBe(0);
    expect(assinaturasQueFaltam(3)).toBe(0);
  });

  it("a mensagem da pendencia some quando as duas estao colhidas", () => {
    expect(mensagemDaPendenciaDeAssinaturas(0)).toBe("Colha as 2 assinaturas.");
    expect(mensagemDaPendenciaDeAssinaturas(1)).toBe("Falta 1 assinatura.");
    expect(mensagemDaPendenciaDeAssinaturas(2)).toBeNull();
  });

  it("titulos: Assinatura 1 e Assinatura 2", () => {
    expect(tituloDaAssinatura(1)).toBe("Assinatura 1");
    expect(tituloDaAssinatura(2)).toBe("Assinatura 2");
  });
});

describe("tela de assinar deitada", () => {
  // iPhone 17 Pro Max em retrato: 440 x 956, entalhe em cima e barra embaixo.
  const janela = { largura: 440, altura: 956 };
  const bordas = { topo: 62, baixo: 34 };
  const g = geometriaDaPrancheta(janela, bordas);

  it("a folha deitada tem o comprimento da altura da tela e a altura da largura", () => {
    expect(g.folha).toEqual({ comprimento: 956, altura: 440 });
  });

  it("as margens da folha respeitam as bordas seguras da tela girada", () => {
    // Esquerda da folha = rodape da tela; direita = topo da tela.
    expect(g.quadro.esquerda).toBe(34 + 16);
    expect(g.quadro.comprimento).toBe(956 - (34 + 16) - (62 + 16));
  });

  it("o quadro na tela tem os lados trocados", () => {
    expect(g.quadroNaTela.largura).toBe(g.quadro.altura);
    expect(g.quadroNaTela.altura).toBe(g.quadro.comprimento);
  });

  it("o quadro na tela cabe dentro da janela", () => {
    const { esquerda, topo, largura, altura } = g.quadroNaTela;
    expect(esquerda).toBeGreaterThanOrEqual(0);
    expect(topo).toBeGreaterThanOrEqual(0);
    expect(esquerda + largura).toBeLessThanOrEqual(janela.largura);
    expect(topo + altura).toBeLessThanOrEqual(janela.altura);
  });

  it("o quadro nao invade o entalhe nem a barra do iPhone", () => {
    const { topo, altura } = g.quadroNaTela;
    expect(topo).toBeGreaterThanOrEqual(bordas.topo);
    expect(topo + altura).toBeLessThanOrEqual(janela.altura - bordas.baixo);
  });

  it("o canto de baixo da area do toque e o INICIO do lado comprido (u = 0)", () => {
    const { largura, altura } = g.quadroNaTela;
    expect(pontoDoDesenho({ x: 0, y: altura }, g)).toEqual({ u: 0, v: 0 });
    expect(pontoDoDesenho({ x: largura, y: altura }, g)).toEqual({ u: 0, v: largura });
  });

  it("o canto de cima da area do toque e o FIM do lado comprido", () => {
    const { altura } = g.quadroNaTela;
    expect(pontoDoDesenho({ x: 0, y: 0 }, g)).toEqual({ u: altura, v: 0 });
  });

  /**
   * A conta tem que ser a inversa do que o layout faz: um ponto da folha
   * (a, b), girado para a esquerda em volta do centro, cai na tela em
   * (x, y) = (b, H - a). O toque la tem que voltar ao mesmo ponto.
   */
  it("ida e volta: ponto da folha para a tela e de volta ao ponto", () => {
    const H = janela.altura;
    for (const [a, b] of [
      [g.quadro.esquerda, g.quadro.topo],
      [g.quadro.esquerda + 100, g.quadro.topo + 40],
      [g.quadro.esquerda + g.quadro.comprimento, g.quadro.topo + g.quadro.altura],
    ]) {
      const naTela = { x: b, y: H - a };
      const local = { x: naTela.x - g.quadroNaTela.esquerda, y: naTela.y - g.quadroNaTela.topo };
      const { u, v } = pontoDoDesenho(local, g);
      expect(u).toBeCloseTo(a - g.quadro.esquerda);
      expect(v).toBeCloseTo(b - g.quadro.topo);
    }
  });

  it("janela minuscula nao gera quadro de tamanho zero ou negativo", () => {
    const pequena = geometriaDaPrancheta({ largura: 10, altura: 10 }, { topo: 50, baixo: 50 });
    expect(pequena.quadro.comprimento).toBeGreaterThan(0);
    expect(pequena.quadro.altura).toBeGreaterThan(0);
  });
});
