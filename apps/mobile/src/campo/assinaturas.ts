/**
 * Regras das assinaturas do checklist (04/11/2026), copiadas do fluxo do
 * antigo: cada pessoa informa o NOME antes de assinar, e o checklist exige
 * DUAS assinaturas. O PDF mostra cada imagem com "Assinado por <nome>".
 *
 * So funcoes puras aqui, para dar para testar sem aparelho -- inclusive a
 * conversao do toque na tela deitada, que e onde um erro de conta viraria
 * assinatura espelhada ou de cabeca para baixo.
 */

/**
 * Quantas assinaturas o app de campo exige quando o modelo nao diz outra
 * coisa. O modelo manda (0092): os checklists dos carros pedem uma so.
 */
export const QUANTIDADE_DE_ASSINATURAS = 2;

/** A quantidade que o modelo exige: 1 ou 2; ausente ou estranha vale o padrao. */
export function assinaturasExigidasPeloModelo(quantidade: number | null | undefined): number {
  return quantidade === 1 || quantidade === 2 ? quantidade : QUANTIDADE_DE_ASSINATURAS;
}

/** Mesmo teto da coluna `checklist_assinaturas.nome` (0090). */
export const LIMITE_DO_NOME = 120;

/** Uma assinatura ja colhida: o nome digitado e o PNG em base64, sem o `data:`. */
export type AssinaturaColhida = { nome: string; png: string };

/** Tira as pontas e junta espacos repetidos: "  Willian   Souza " vira "Willian Souza". */
export function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

/** `null` quando o nome serve; senao, o que dizer a quem digitou. */
export function problemaNoNome(nome: string): string | null {
  const limpo = normalizarNome(nome);
  if (limpo === "") return "Informe o nome de quem vai assinar.";
  if (limpo.length > LIMITE_DO_NOME) return `O nome deve ter no máximo ${LIMITE_DO_NOME} caracteres.`;
  return null;
}

/** "Assinatura 1", "Assinatura 2": o titulo da caixa e da tela de assinar. Com uma so, "Assinatura". */
export function tituloDaAssinatura(posicao: number, exigidas = QUANTIDADE_DE_ASSINATURAS): string {
  return exigidas === 1 ? "Assinatura" : `Assinatura ${posicao}`;
}

/** Quantas faltam para as exigidas, nunca negativo. */
export function assinaturasQueFaltam(colhidas: number, exigidas = QUANTIDADE_DE_ASSINATURAS): number {
  return Math.max(0, exigidas - colhidas);
}

/** A mensagem da pendencia, ou `null` com todas colhidas. */
export function mensagemDaPendenciaDeAssinaturas(
  colhidas: number,
  exigidas = QUANTIDADE_DE_ASSINATURAS,
): string | null {
  const faltam = assinaturasQueFaltam(colhidas, exigidas);
  if (faltam === 0) return null;
  if (exigidas === 1) return "Colha a assinatura.";
  if (colhidas === 0) return `Colha as ${exigidas} assinaturas.`;
  return faltam === 1 ? "Falta 1 assinatura." : `Faltam ${faltam} assinaturas.`;
}

// ---------------------------------------------------------------------------
// Tela de assinar, deitada
// ---------------------------------------------------------------------------
//
// O app e travado em retrato, e o antigo mostra o quadro de assinatura
// deitado. Sem modulo nativo novo, a tela e girada 90 graus no sentido
// anti-horario por layout (`rotate: -90deg`), com o topo da folha deitada no
// lado ESQUERDO da tela. O desenho e guardado em coordenadas da folha deitada
// (`u` ao longo do lado comprido, `v` ao longo do curto), e o toque, que chega
// em coordenadas da tela, e convertido aqui.

/** Medidas da tela de assinar deitada, em pontos. */
export type GeometriaDaPrancheta = {
  /** Folha deitada inteira: comprimento = altura da tela, altura = largura. */
  folha: { comprimento: number; altura: number };
  /** O quadro onde se assina, em coordenadas da folha deitada. */
  quadro: { esquerda: number; topo: number; comprimento: number; altura: number };
  /** O mesmo quadro em coordenadas da tela (onde fica a area que recebe o toque). */
  quadroNaTela: { esquerda: number; topo: number; largura: number; altura: number };
};

const FAIXA_DE_BOTOES = 72;
const RESPIRO = 16;

/**
 * Onde cada coisa fica, dadas a janela e as bordas seguras. Na folha deitada,
 * a margem da esquerda e o rodape da tela (barra do iPhone) e a da direita e o
 * topo dela (entalhe).
 */
export function geometriaDaPrancheta(
  janela: { largura: number; altura: number },
  bordas: { topo: number; baixo: number },
): GeometriaDaPrancheta {
  const comprimento = janela.altura;
  const alturaDaFolha = janela.largura;

  const esquerda = bordas.baixo + RESPIRO;
  const direita = bordas.topo + RESPIRO;
  const topo = FAIXA_DE_BOTOES + 8;

  const quadro = {
    esquerda,
    topo,
    comprimento: Math.max(1, comprimento - esquerda - direita),
    altura: Math.max(1, alturaDaFolha - topo - RESPIRO),
  };

  return {
    folha: { comprimento, altura: alturaDaFolha },
    quadro,
    quadroNaTela: {
      esquerda: quadro.topo,
      topo: comprimento - (quadro.esquerda + quadro.comprimento),
      largura: quadro.altura,
      altura: quadro.comprimento,
    },
  };
}

/**
 * Toque na area do quadro (coordenadas locais dela, na tela em retrato) para
 * ponto do desenho (coordenadas do quadro na folha deitada).
 *
 * Girada para a esquerda, a folha tem o lado comprido subindo pela tela: o `u`
 * cresce de baixo para cima, e o `v` da esquerda para a direita.
 */
export function pontoDoDesenho(
  toque: { x: number; y: number },
  geometria: GeometriaDaPrancheta,
): { u: number; v: number } {
  return { u: geometria.quadro.comprimento - toque.y, v: toque.x };
}
