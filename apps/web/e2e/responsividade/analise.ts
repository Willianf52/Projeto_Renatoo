import type { Page } from "@playwright/test";

/**
 * O que a varredura de responsividade considera quebra estrutural, separado
 * em duas metades:
 *
 * - `coletarLayout` roda DENTRO do navegador e so mede: tamanho da pagina e a
 *   caixa de cada elemento interativo visivel.
 * - `analisarLayout` roda no Node e so decide, sobre os numeros coletados.
 *   Funcao pura -- testada em `analise.spec.ts` sem abrir navegador, com
 *   caixas montadas a mao.
 *
 * Tres criterios, escolhidos por serem OBJETIVOS (nao dependem de gosto):
 *
 * 1. Rolagem horizontal da pagina: o documento e mais largo que a tela. Tabela
 *    larga dentro de um container com `overflow-x: auto` e o comportamento
 *    certo e nao conta -- quem rola ali e o container, nao a pagina.
 * 2. Elemento cortado na borda: um botao/campo/link que comeca dentro da tela
 *    e termina fora dela (ou o contrario), sem estar num container rolavel.
 * 3. Sobreposicao: dois elementos interativos, um fora do outro no DOM, cujas
 *    caixas se cobrem em pelo menos 25% da area do menor. E o "botao por cima
 *    do campo" que impede o toque certo no tablet. EXCECAO: o botao-adorno
 *    (o olho do "Mostrar senha", um icone de calendario) que fica inteiro
 *    dentro do respiro que o proprio campo reserva com padding -- ali o texto
 *    nunca passa por baixo, e e desenho, nao quebra. Foi o primeiro falso
 *    positivo da varredura, no login.
 *
 * Nao entra: alinhamento, espacamento, cor, fonte -- nada disso e quebra, e
 * julgar isso por script so geraria ruido.
 */

/** Onde `sessao.setup.ts` grava a sessao e a varredura a le. Aqui, e nao no
 * setup, porque o Playwright nao deixa um spec importar arquivo de setup. */
export const SESSAO_DA_VARREDURA = "e2e/.auth/responsividade.json";

export type Caixa = { x: number; y: number; largura: number; altura: number };

export type ElementoMedido = Caixa & {
  /** Como o elemento aparece no relatorio: tag + texto ou rotulo, curto. */
  descricao: string;
  /** Esta dentro de um container que rola na horizontal (tabela larga, por exemplo). */
  emContainerRolavel: boolean;
  /** Indices (nesta mesma lista) dos elementos interativos que o contem. */
  ancestrais: number[];
  /** Padding lateral de campo de texto (0 nos demais): o espaco reservado a adornos. */
  respiroEsquerda: number;
  respiroDireita: number;
};

export type LayoutMedido = {
  larguraDaTela: number;
  larguraDoDocumento: number;
  elementos: ElementoMedido[];
};

/** Folga de 1px para arredondamento de subpixel, que nao e quebra. */
const TOLERANCIA = 1;

/** Fracao da area do MENOR elemento a partir da qual a sobreposicao conta. */
const FRACAO_DE_SOBREPOSICAO = 0.25;

/** Abaixo disto e borda encostando, nao um elemento cobrindo outro. */
const AREA_MINIMA = 16;

/** O botao cabe inteiro no respiro lateral do campo? Entao e adorno, nao choque. */
function ehAdorno(campo: ElementoMedido, botao: ElementoMedido): boolean {
  const dentroNaVertical = botao.y >= campo.y - TOLERANCIA && botao.y + botao.altura <= campo.y + campo.altura + TOLERANCIA;
  if (!dentroNaVertical) return false;

  const inicioDoRespiroDireito = campo.x + campo.largura - campo.respiroDireita;
  const fimDoRespiroEsquerdo = campo.x + campo.respiroEsquerda;

  const noRespiroDireito =
    campo.respiroDireita > 0 &&
    botao.x >= inicioDoRespiroDireito - TOLERANCIA &&
    botao.x + botao.largura <= campo.x + campo.largura + TOLERANCIA;
  const noRespiroEsquerdo =
    campo.respiroEsquerda > 0 && botao.x >= campo.x - TOLERANCIA && botao.x + botao.largura <= fimDoRespiroEsquerdo + TOLERANCIA;

  return noRespiroDireito || noRespiroEsquerdo;
}

function areaDaIntersecao(a: Caixa, b: Caixa): number {
  const largura = Math.min(a.x + a.largura, b.x + b.largura) - Math.max(a.x, b.x);
  const altura = Math.min(a.y + a.altura, b.y + b.altura) - Math.max(a.y, b.y);
  return largura > 0 && altura > 0 ? largura * altura : 0;
}

export function analisarLayout(layout: LayoutMedido): string[] {
  const problemas: string[] = [];
  const { larguraDaTela, larguraDoDocumento, elementos } = layout;

  if (larguraDoDocumento > larguraDaTela + TOLERANCIA) {
    problemas.push(
      `Rolagem horizontal na página: o conteúdo tem ${Math.round(larguraDoDocumento)}px numa tela de ${larguraDaTela}px.`,
    );
  }

  for (const elemento of elementos) {
    if (elemento.emContainerRolavel) continue;

    const direita = elemento.x + elemento.largura;
    const cortadoNaDireita = elemento.x < larguraDaTela && direita > larguraDaTela + TOLERANCIA;
    const cortadoNaEsquerda = elemento.x < -TOLERANCIA && direita > 0;

    if (cortadoNaDireita || cortadoNaEsquerda) {
      problemas.push(
        `Cortado na borda ${cortadoNaDireita ? "direita" : "esquerda"}: ${elemento.descricao} ` +
          `(de ${Math.round(elemento.x)}px a ${Math.round(direita)}px, tela de ${larguraDaTela}px).`,
      );
    }
  }

  for (let i = 0; i < elementos.length; i++) {
    for (let j = i + 1; j < elementos.length; j++) {
      const a = elementos[i];
      const b = elementos[j];

      // Um dentro do outro (o `<input>` dentro do `<label>` clicavel, por
      // exemplo) e composicao, nao sobreposicao.
      if (a.ancestrais.includes(j) || b.ancestrais.includes(i)) continue;
      if (ehAdorno(a, b) || ehAdorno(b, a)) continue;

      const intersecao = areaDaIntersecao(a, b);
      if (intersecao < AREA_MINIMA) continue;

      const menor = Math.min(a.largura * a.altura, b.largura * b.altura);
      if (intersecao / menor >= FRACAO_DE_SOBREPOSICAO) {
        problemas.push(
          `Sobreposição: ${a.descricao} cobre ${Math.round((intersecao / menor) * 100)}% de ${b.descricao}.`,
        );
      }
    }
  }

  return problemas;
}

/**
 * Mede a pagina ja carregada. Tudo aqui dentro roda no navegador -- por isso
 * nao pode usar nada de fora da funcao.
 */
export function coletarLayout(page: Page): Promise<LayoutMedido> {
  return page.evaluate(() => {
    const SELETOR =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="combobox"], [role="checkbox"], [role="radio"], [role="tab"]';

    const visivel = (el: Element) => {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) return false;
      // Gaveta fechada fora da tela pela esquerda: escondida de proposito.
      if (caixa.right <= 0) return false;
      if (el.closest('[aria-hidden="true"], [inert]')) return false;
      const estilo = getComputedStyle(el);
      return estilo.visibility !== "hidden" && Number(estilo.opacity) > 0;
    };

    const emContainerRolavel = (el: Element) => {
      for (let pai = el.parentElement; pai && pai !== document.body; pai = pai.parentElement) {
        const overflowX = getComputedStyle(pai).overflowX;
        if ((overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") && pai.scrollWidth > pai.clientWidth) {
          return true;
        }
      }
      return false;
    };

    const descrever = (el: Element) => {
      const rotulo =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el as HTMLInputElement).placeholder ||
        el.getAttribute("name") ||
        el.textContent ||
        "";
      const texto = rotulo.replace(/\s+/g, " ").trim().slice(0, 40);
      return `<${el.tagName.toLowerCase()}>${texto ? ` "${texto}"` : ""}`;
    };

    const nos = Array.from(document.querySelectorAll(SELETOR)).filter(visivel);

    const ehCampoDeTexto = (el: Element) =>
      el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file"].includes((el as HTMLInputElement).type));

    const elementos = nos.map((el) => {
      const caixa = el.getBoundingClientRect();
      return {
        descricao: descrever(el),
        x: caixa.left,
        // Coordenada do documento, nao da janela: a pagina inteira e medida,
        // nao so a primeira dobra.
        y: caixa.top + window.scrollY,
        largura: caixa.width,
        altura: caixa.height,
        emContainerRolavel: emContainerRolavel(el),
        ancestrais: nos.flatMap((outro, indice) => (outro !== el && outro.contains(el) ? [indice] : [])),
        respiroEsquerda: ehCampoDeTexto(el) ? parseFloat(getComputedStyle(el).paddingLeft) : 0,
        respiroDireita: ehCampoDeTexto(el) ? parseFloat(getComputedStyle(el).paddingRight) : 0,
      };
    });

    return {
      larguraDaTela: document.documentElement.clientWidth,
      larguraDoDocumento: document.documentElement.scrollWidth,
      elementos,
    };
  });
}
