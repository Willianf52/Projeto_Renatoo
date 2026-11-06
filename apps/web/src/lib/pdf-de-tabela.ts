import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarEmissao } from "@/lib/data-hora";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { LOGO_PARA_PAPEL_PNG_BASE64 } from "@/lib/logo-para-papel";
import { paraWinAnsi, quebrarEmLinhas } from "@/lib/pdf-do-checklist";

/**
 * O PDF de uma tabela, montado no servidor e entregue como ARQUIVO para
 * baixar (pedido do dono, 05/11/2026: o botao PDF nao deve abrir aba nova nem
 * a janela de impressao, so baixar).
 *
 * O desenho e o da folha impressa (`TabelaImpressao`): logo no canto, titulo
 * e periodo no centro, cabecalho em negrito, linhas zebradas, e no pe a
 * emissao a esquerda e "N de M" no centro.
 */

const PRETO = rgb(0, 0, 0);
const ZEBRA = rgb(0.898, 0.898, 0.898);
const MARGEM = 28;
const TAMANHO = 7;
const ALTURA_DA_LINHA = 9;

export type OpcoesDaTabela = {
  titulo: string;
  /** "PERIODO: ..." ou outra linha sob o titulo; nulo nao mostra. */
  apoio?: string | null;
  colunas: string[];
  linhas: string[][];
  /** Linha de total no pe da tabela. */
  rodape?: string[];
  /** Aviso de corte ("Limitado aos primeiros N registros..."). */
  aviso?: string | null;
  /** "zebrado" (centralizado e em maiusculas) ou "simples" (a esquerda). */
  estilo?: "zebrado" | "simples";
  paisagem?: boolean;
};

/** Larguras proporcionais ao texto mais comprido de cada coluna, com piso e teto. */
function larguras(colunas: string[], linhas: string[][], fonte: PDFFont, total: number): number[] {
  const medidas = colunas.map((coluna, i) => {
    let maior = fonte.widthOfTextAtSize(paraWinAnsi(coluna), TAMANHO);
    for (const linha of linhas.slice(0, 300)) {
      const texto = paraWinAnsi(linha[i] ?? "").split("\n")[0];
      maior = Math.max(maior, fonte.widthOfTextAtSize(texto, TAMANHO));
    }
    return Math.min(Math.max(maior + 6, 30), 220);
  });
  const soma = medidas.reduce((a, b) => a + b, 0);
  return medidas.map((m) => (m / soma) * total);
}

export async function gerarPdfDeTabela(opcoes: OpcoesDaTabela): Promise<Uint8Array> {
  const zebrado = (opcoes.estilo ?? "zebrado") === "zebrado";
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Uint8Array.from(Buffer.from(LOGO_PARA_PAPEL_PNG_BASE64, "base64"))).catch(() => null);

  const [largura, altura] = opcoes.paisagem || opcoes.colunas.length > 7 ? [841.89, 595.28] : [595.28, 841.89];
  const util = largura - 2 * MARGEM;
  const cols = larguras(opcoes.colunas, opcoes.linhas, normal, util);
  const emissao = formatarEmissao(new Date());
  const titulo = zebrado ? opcoes.titulo.toUpperCase() : opcoes.titulo;

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  const celulas = (linha: string[], fonte: PDFFont) =>
    linha.map((campo, i) => quebrarEmLinhas(campo ?? "", fonte, TAMANHO, Math.max(cols[i] - 4, 10)));

  const desenharLinha = (linha: string[], fonte: PDFFont, fundo: boolean) => {
    const quebradas = celulas(linha, fonte);
    const altura = Math.max(1, ...quebradas.map((q) => q.length)) * ALTURA_DA_LINHA + 2;
    if (y - altura < MARGEM + 14) {
      novaPagina();
      cabecalhoDaTabela();
    }
    if (fundo) pagina.drawRectangle({ x: MARGEM, y: y - altura, width: util, height: altura, color: ZEBRA });
    let x = MARGEM;
    quebradas.forEach((linhasDaCelula, i) => {
      linhasDaCelula.forEach((texto, k) => {
        const w = fonte.widthOfTextAtSize(texto, TAMANHO);
        const tx = zebrado ? x + (cols[i] - w) / 2 : x + 2;
        pagina.drawText(texto, { x: tx, y: y - 1 - (k + 1) * ALTURA_DA_LINHA + 2, size: TAMANHO, font: fonte, color: PRETO });
      });
      x += cols[i];
    });
    y -= altura;
  };

  const cabecalhoDaTabela = () => {
    desenharLinha(zebrado ? opcoes.colunas.map((c) => c.toUpperCase()) : opcoes.colunas, negrito, false);
  };

  const novaPagina = () => {
    pagina = doc.addPage([largura, altura]);
    paginas.push(pagina);
    y = altura - MARGEM;
    if (logo) {
      const ajuste = logo.scaleToFit(80, 30);
      pagina.drawImage(logo, { x: MARGEM, y: y - ajuste.height, width: ajuste.width, height: ajuste.height });
    }
    const t = paraWinAnsi(titulo);
    pagina.drawText(t, { x: (largura - negrito.widthOfTextAtSize(t, 11)) / 2, y: y - 12, size: 11, font: negrito, color: PRETO });
    let fim = y - 16;
    if (opcoes.apoio) {
      const a = paraWinAnsi(opcoes.apoio);
      pagina.drawText(a, { x: (largura - negrito.widthOfTextAtSize(a, 8)) / 2, y: y - 24, size: 8, font: negrito, color: PRETO });
      fim = y - 28;
    }
    y = Math.min(fim, y - 34) - 6;
  };

  novaPagina();
  if (opcoes.aviso) {
    const a = paraWinAnsi(opcoes.aviso);
    pagina.drawText(a, { x: (largura - normal.widthOfTextAtSize(a, 7)) / 2, y: y - 8, size: 7, font: normal, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
  }
  cabecalhoDaTabela();
  opcoes.linhas.forEach((linha, i) => desenharLinha(linha, normal, zebrado && i % 2 === 0));
  if (opcoes.rodape && opcoes.linhas.length > 0) desenharLinha(opcoes.rodape, negrito, false);

  paginas.forEach((p, i) => {
    p.drawText(paraWinAnsi(emissao), { x: MARGEM, y: 14, size: 7, font: normal, color: PRETO });
    const contador = `${i + 1} de ${paginas.length}`;
    p.drawText(contador, { x: (largura - normal.widthOfTextAtSize(contador, 7)) / 2, y: 14, size: 7, font: normal, color: PRETO });
  });

  return doc.save();
}

/** A resposta HTTP de download, com o nome do arquivo. */
export function respostaDePdf(bytes: Uint8Array, nome: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome.replace(/[^A-Za-z0-9_.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** O aviso do topo quando a consulta bateu no limite; nulo quando nao. */
export function avisoDeCorte(truncado: boolean, limite: number): string | null {
  return truncado ? `Limitado aos primeiros ${limite} registros. Ajuste os filtros para reduzir o total.` : null;
}

/**
 * O download de PDF de uma tela de tabela: monta as opcoes, gera e responde
 * como arquivo. Erro vira 500 com texto, e o detalhe vai para o log.
 */
export async function baixarPdfDeTabela(
  nomeDoArquivo: string,
  tela: string,
  montar: () => Promise<OpcoesDaTabela>,
): Promise<Response> {
  try {
    return respostaDePdf(await gerarPdfDeTabela(await montar()), nomeDoArquivo);
  } catch (falha) {
    erro(gerarIdDeRequisicao(), `${tela}: falha ao gerar o PDF:`, falha);
    return new Response("Não foi possível gerar o PDF. Tente de novo.", { status: 500 });
  }
}
