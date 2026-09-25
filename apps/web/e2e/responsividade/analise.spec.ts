import { expect, test } from "@playwright/test";
import { analisarLayout, type ElementoMedido } from "./analise";

/**
 * Os criterios da varredura, sem navegador: caixas montadas a mao. Roda no
 * mesmo `playwright test`, mas nenhum destes testes pede `page`, entao nenhum
 * Chromium e aberto para eles.
 */

function elemento(parcial: Partial<ElementoMedido> & Pick<ElementoMedido, "x" | "y">): ElementoMedido {
  return {
    descricao: "<button>",
    largura: 100,
    altura: 40,
    emContainerRolavel: false,
    ancestrais: [],
    respiroEsquerda: 0,
    respiroDireita: 0,
    ...parcial,
  };
}

test.describe("analisarLayout", () => {
  test("pagina que cabe na tela e sem choque nao tem problema", () => {
    expect(
      analisarLayout({
        larguraDaTela: 800,
        larguraDoDocumento: 800,
        elementos: [elemento({ x: 0, y: 0 }), elemento({ x: 120, y: 0 })],
      }),
    ).toEqual([]);
  });

  test("acusa rolagem horizontal da pagina", () => {
    const problemas = analisarLayout({ larguraDaTela: 768, larguraDoDocumento: 1480, elementos: [] });

    expect(problemas).toEqual(["Rolagem horizontal na página: o conteúdo tem 1480px numa tela de 768px."]);
  });

  test("ignora 1px de arredondamento", () => {
    expect(analisarLayout({ larguraDaTela: 768, larguraDoDocumento: 769, elementos: [] })).toEqual([]);
  });

  test("acusa botao cortado na borda direita", () => {
    const problemas = analisarLayout({
      larguraDaTela: 768,
      larguraDoDocumento: 768,
      elementos: [elemento({ x: 700, y: 10, descricao: '<button> "Filtrar"' })],
    });

    expect(problemas[0]).toMatch(/^Cortado na borda direita: <button> "Filtrar"/);
  });

  test("elemento dentro de tabela que rola nao conta como cortado", () => {
    expect(
      analisarLayout({
        larguraDaTela: 768,
        larguraDoDocumento: 768,
        elementos: [elemento({ x: 700, y: 10, emContainerRolavel: true })],
      }),
    ).toEqual([]);
  });

  test("acusa dois controles um por cima do outro", () => {
    const problemas = analisarLayout({
      larguraDaTela: 800,
      larguraDoDocumento: 800,
      elementos: [
        elemento({ x: 0, y: 0, descricao: '<input> "Busca"' }),
        elemento({ x: 50, y: 0, descricao: '<button> "Filtrar"' }),
      ],
    });

    expect(problemas).toEqual(['Sobreposição: <input> "Busca" cobre 50% de <button> "Filtrar".']);
  });

  test("encostar na borda nao e sobreposicao", () => {
    expect(
      analisarLayout({
        larguraDaTela: 800,
        larguraDoDocumento: 800,
        elementos: [elemento({ x: 0, y: 0 }), elemento({ x: 99.8, y: 0 })],
      }),
    ).toEqual([]);
  });

  test("elemento dentro de outro (input dentro de label) nao e sobreposicao", () => {
    expect(
      analisarLayout({
        larguraDaTela: 800,
        larguraDoDocumento: 800,
        elementos: [elemento({ x: 0, y: 0 }), elemento({ x: 10, y: 5, largura: 50, altura: 20, ancestrais: [0] })],
      }),
    ).toEqual([]);
  });

  test("olho do Mostrar senha dentro do respiro do campo nao e sobreposicao", () => {
    // O caso real do login: campo de 400px com pr-11 (44px), botao de 36px encostado a direita.
    expect(
      analisarLayout({
        larguraDaTela: 800,
        larguraDoDocumento: 800,
        elementos: [
          elemento({ x: 0, y: 0, largura: 400, altura: 44, respiroDireita: 44, descricao: '<input> "password"' }),
          elemento({ x: 360, y: 4, largura: 36, altura: 36, descricao: '<button> "Mostrar senha"' }),
        ],
      }),
    ).toEqual([]);
  });

  test("botao que invade a area do texto do campo continua sendo acusado", () => {
    const problemas = analisarLayout({
      larguraDaTela: 800,
      larguraDoDocumento: 800,
      elementos: [
        elemento({ x: 0, y: 0, largura: 400, altura: 44, respiroDireita: 12, descricao: '<input> "Busca"' }),
        elemento({ x: 340, y: 4, largura: 36, altura: 36, descricao: '<button> "Limpar"' }),
      ],
    });

    expect(problemas).toHaveLength(1);
  });
});
