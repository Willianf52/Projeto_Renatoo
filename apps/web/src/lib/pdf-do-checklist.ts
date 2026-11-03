import "server-only";

import * as UPNGTipos from "@pdf-lib/upng";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Database } from "@projeto-renatoo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  camposDoResumo,
  getChecklistPeloCliente,
  TIPO_CONSULTORIA,
  type ChecklistDetalhe,
} from "@/app/dashboard/checklistlab/historico-de-checklist/queries";
import { formatarDataHora, formatarEmissao } from "@/lib/data-hora";
import { LOGO_PARA_PAPEL_PNG_BASE64 } from "@/lib/logo-para-papel";

/**
 * PDF de um checklist, para ir anexado ao aviso de inspecao (0080).
 *
 * NO PADRAO DO PORTAL (pedido do dono, 03/11/2026): copia o "Exportar PDF
 * Unificado" do Historico de Checklist (`export/pdf-unificado/page.tsx`) e a
 * moldura de impressao dele (`TabelaImpressao`): folha branca, logo no canto,
 * titulo no centro, resumo em tres colunas com rotulo cinza em maiusculas,
 * respostas numa tabela com borda (Ordem, Pergunta, Resposta, Observacao,
 * Fotos), fotos gerais com a data embaixo, assinatura em preto, e no rodape
 * a emissao e "N de M". Mudou la, muda aqui.
 *
 * POR QUE NO SERVIDOR. O PDF da tela sai do proprio navegador (`window.print`),
 * e um anexo de e-mail precisa existir sem ninguem com a tela aberta: a fila
 * roda sozinha, quando o inspetor envia o checklist. `pdf-lib` e JavaScript
 * puro -- sem Chrome, sem binario --, que e o que cabe numa funcao da Vercel.
 *
 * O conteudo vem da MESMA consulta (`getChecklistPeloCliente`) e do MESMO
 * resumo (`camposDoResumo`) da tela: o PDF e a tela nao tem como mostrar coisas
 * diferentes. Fotos e assinatura vem do bucket privado pela service_role, e so
 * entram se forem JPEG ou PNG de verdade (pelos primeiros bytes, nao pelo tipo
 * declarado no upload -- o mesmo cuidado de `midia.ts`).
 */

// O pacote declara so exportacoes nomeadas, mas o modulo entrega tudo no
// `default` (e assim que o proprio pdf-lib o usa). Aceita as duas formas.
const UPNG = (UPNGTipos as unknown as { default?: typeof UPNGTipos }).default ?? UPNGTipos;

const BUCKET = "checklists";

// A4 em pontos, com as margens do `@page` da `TabelaImpressao` (12/10/16 mm).
const LARGURA = 595.28;
const ALTURA = 841.89;
const MM = 72 / 25.4;
const TOPO = 12 * MM;
const LADO = 10 * MM;
const BASE = 16 * MM;
const UTIL = LARGURA - 2 * LADO;

// As cores das classes do Tailwind usadas na pagina de impressao.
const PRETO = rgb(0, 0, 0);
const CINZA_ROTULO = rgb(0x47 / 255, 0x55 / 255, 0x69 / 255); // slate-600
const BORDA = rgb(0xcb / 255, 0xd5 / 255, 0xe1 / 255); // slate-300
const FUNDO_DO_CABECALHO = rgb(0xf1 / 255, 0xf5 / 255, 0xf9 / 255); // slate-100
const LINHA_DO_TITULO = rgb(0x94 / 255, 0xa3 / 255, 0xb8 / 255); // slate-400
const RODAPE = rgb(0x33 / 255, 0x33 / 255, 0x33 / 255);

// text-xs (12px) e text-base (16px) da tela, em pontos.
const TEXTO = 9;
const TITULO = 12;
const ENTRELINHA = 1.35;

/** As colunas da tabela de respostas, nas proporcoes da pagina impressa. */
const COLUNAS = [
  { titulo: "Ordem", largura: 40 },
  { titulo: "Pergunta", largura: 190 },
  { titulo: "Resposta", largura: 72 },
  { titulo: "Observação", largura: 120 },
  { titulo: "Fotos", largura: UTIL - 40 - 190 - 72 - 120 },
];
const RECUO = 4; // px-2 / py-1 da celula
const MINIATURA = 40; // h-16 w-16 da foto na celula
const FOTO_GERAL = 96; // h-32 w-32 das fotos gerais

type Admin = SupabaseClient<Database>;
type Fontes = { normal: PDFFont; negrito: PDFFont };

/**
 * A Helvetica padrao do PDF so desenha o alfabeto WinAnsi (o latino com
 * acentos). Caractere fora dele (a seta do caminho do site, emoji digitado na
 * observacao) faria `drawText` lancar -- e um caractere estranho nao pode
 * derrubar o aviso inteiro.
 */
export function paraWinAnsi(texto: string): string {
  return texto
    .replace(/→/g, ">")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\t/g, " ")
    .replace(/[^\n -~ -ÿ]/g, "");
}

/** Quebra o texto em linhas que cabem na largura, respeitando as quebras digitadas. */
export function quebrarEmLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of paraWinAnsi(texto).split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      // Palavra sozinha maior que a linha (link, codigo): corta no meio.
      let resto = palavra;
      while (fonte.widthOfTextAtSize(resto, tamanho) > largura && resto.length > 1) {
        let corte = resto.length - 1;
        while (corte > 1 && fonte.widthOfTextAtSize(resto.slice(0, corte), tamanho) > largura) corte -= 1;
        linhas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      atual = resto;
    }
    linhas.push(atual);
  }
  return linhas;
}

/** JPEG comeca com FF D8 FF; PNG com 89 50 4E 47. O resto nao entra. */
function tipoDaImagem(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

/**
 * Inverte o claro e o escuro de um PNG, mantendo o matiz e a transparencia --
 * o `filter: invert(1) hue-rotate(180deg)` que a impressao do portal aplica ao
 * logo, e o `invert` da assinatura. Os dois arquivos sao brancos, feitos para
 * o fundo escuro do app, e no papel sumiriam.
 */
export function inverterClaridade(png: Uint8Array): Uint8Array {
  const copia = png.slice();
  const imagem = UPNG.decode(copia.buffer as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(imagem)[0]);
  for (let i = 0; i < rgba.length; i += 4) {
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    // Inverter e girar o matiz em 180 graus = espelhar a luminosidade e manter
    // a cor: soma maximo e minimo e subtrai cada canal.
    const soma = Math.max(r, g, b) + Math.min(r, g, b);
    rgba[i] = 255 - soma + r;
    rgba[i + 1] = 255 - soma + g;
    rgba[i + 2] = 255 - soma + b;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], imagem.width, imagem.height, 0));
}

/** O logo ja invertido para o papel (ver `logo-para-papel.ts`). */
function logoParaPapel(): Uint8Array {
  return Uint8Array.from(Buffer.from(LOGO_PARA_PAPEL_PNG_BASE64, "base64"));
}

/** Folha com cursor: escreve de cima para baixo e abre outra quando acaba. */
class Folha {
  pagina: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly fontes: Fontes,
  ) {
    this.pagina = doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - TOPO;
  }

  cabe(altura: number): boolean {
    return this.y - altura >= BASE;
  }

  /** Garante `altura` livre; senao, pagina nova. Devolve se abriu pagina. */
  espaco(altura: number): boolean {
    if (this.cabe(altura)) return false;
    this.pagina = this.doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - TOPO;
    return true;
  }

  /** Linhas de texto a partir de `x`, na largura dada. */
  texto(
    conteudo: string,
    opcoes: { tamanho?: number; negrito?: boolean; cor?: ReturnType<typeof rgb>; x?: number; largura?: number; centro?: boolean } = {},
  ) {
    const tamanho = opcoes.tamanho ?? TEXTO;
    const fonte = opcoes.negrito ? this.fontes.negrito : this.fontes.normal;
    const x = opcoes.x ?? LADO;
    const largura = opcoes.largura ?? UTIL - (x - LADO);
    for (const linha of quebrarEmLinhas(conteudo, fonte, tamanho, largura)) {
      this.espaco(tamanho * ENTRELINHA);
      const deslocamento = opcoes.centro ? (largura - fonte.widthOfTextAtSize(linha, tamanho)) / 2 : 0;
      this.pagina.drawText(linha, { x: x + deslocamento, y: this.y - tamanho, size: tamanho, font: fonte, color: opcoes.cor ?? PRETO });
      this.y -= tamanho * ENTRELINHA;
    }
  }

  /** `h3` da pagina impressa: negrito, texto pequeno, com folga embaixo. */
  subtitulo(conteudo: string) {
    this.y -= 10;
    this.espaco(TEXTO * ENTRELINHA + 30);
    this.texto(conteudo, { negrito: true });
    this.y -= 3;
  }
}

/** Uma imagem dentro de uma caixa quadrada, centralizada, com a borda da tela. */
function desenharMiniatura(pagina: PDFPage, imagem: PDFImage, x: number, topo: number, lado: number) {
  const ajuste = imagem.scaleToFit(lado, lado);
  pagina.drawRectangle({ x, y: topo - lado, width: lado, height: lado, borderColor: BORDA, borderWidth: 0.6 });
  pagina.drawImage(imagem, {
    x: x + (lado - ajuste.width) / 2,
    y: topo - lado + (lado - ajuste.height) / 2,
    width: ajuste.width,
    height: ajuste.height,
  });
}

async function baixar(admin: Admin, caminho: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function embutir(doc: PDFDocument, bytes: Uint8Array | null, inverter = false): Promise<PDFImage | null> {
  if (!bytes) return null;
  const tipo = tipoDaImagem(bytes);
  try {
    if (tipo === "jpg") return await doc.embedJpg(bytes);
    if (tipo === "png") return await doc.embedPng(inverter ? inverterClaridade(bytes) : bytes);
  } catch {
    // Arquivo corrompido: fica de fora, o resto do PDF segue.
  }
  return null;
}

/** Nome do arquivo anexado, sem acento nem espaco: alguns clientes de e-mail estragam. */
export function nomeDoArquivo(detalhe: Pick<ChecklistDetalhe, "linha">): string {
  const numero = detalhe.linha.numeroAno.replace(/[^0-9]+/g, "-").replace(/^-|-$/g, "") || String(detalhe.linha.id);
  return `checklist-${numero}.pdf`;
}

/**
 * O PDF do checklist `id`, ou `null` se ele nao existe. Lanca se o banco nao
 * responder -- quem chama decide mandar o aviso sem o anexo.
 */
export async function gerarPdfDoChecklist(
  admin: Admin,
  id: number,
  agora: Date = new Date(),
): Promise<{ arquivo: Uint8Array; nome: string } | null> {
  const detalhe = await getChecklistPeloCliente(admin, id);
  if (!detalhe) return null;

  // Os caminhos ficam fora do detalhe da tela de proposito (ver `midia.ts`):
  // aqui, com a service_role, sao lidos so para baixar os arquivos.
  const [{ data: fotos }, { data: checklist }] = await Promise.all([
    admin.from("checklist_fotos").select("id, storage_path, pergunta_id").eq("checklist_id", id).order("id"),
    admin.from("checklists_visita").select("assinatura_path").eq("id", id).maybeSingle(),
  ]);

  const { linha } = detalhe;
  const consultoria = linha.tipo === TIPO_CONSULTORIA;

  const doc = await PDFDocument.create();
  doc.setTitle(paraWinAnsi(`Checklist ${linha.numeroAno || linha.id}`));
  doc.setProducer("Portal Operacional Up Serviços");
  const fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const imagemPorFoto = new Map<number, PDFImage>();
  await Promise.all(
    (fotos ?? []).map(async (foto) => {
      const imagem = await embutir(doc, await baixar(admin, foto.storage_path));
      if (imagem) imagemPorFoto.set(foto.id, imagem);
    }),
  );
  const [assinatura, logo] = await Promise.all([
    checklist?.assinatura_path ? baixar(admin, checklist.assinatura_path).then((b) => embutir(doc, b, true)) : null,
    embutir(doc, logoParaPapel()),
  ]);

  const folha = new Folha(doc, fontes);

  // Cabecalho da `TabelaImpressao`: logo no canto, titulo no centro.
  const topoDoCabecalho = folha.y;
  if (logo) {
    const ajuste = logo.scaleToFit(80, 30);
    folha.pagina.drawImage(logo, { x: LADO, y: topoDoCabecalho - ajuste.height, width: ajuste.width, height: ajuste.height });
  }
  folha.y = topoDoCabecalho - 9;
  folha.texto(`Checklist de ${linha.checklist} (${linha.numeroAno || `#${linha.id}`})`, {
    tamanho: TITULO,
    negrito: true,
    centro: true,
  });
  folha.y = Math.min(folha.y, topoDoCabecalho - 34) - 4;
  folha.pagina.drawLine({ start: { x: LADO, y: folha.y }, end: { x: LARGURA - LADO, y: folha.y }, thickness: 0.6, color: LINHA_DO_TITULO });
  folha.y -= 10;

  // Resumo em tres colunas, rotulo em cima do valor.
  const larguraDaColuna = (UTIL - 2 * 12) / 3;
  const campos = camposDoResumo(detalhe);
  for (let i = 0; i < campos.length; i += 3) {
    const trio = campos.slice(i, i + 3);
    const alturas = trio.map((campo) => (1 + Math.max(1, quebrarEmLinhas(campo.valor, fontes.normal, TEXTO, larguraDaColuna).length)) * TEXTO * ENTRELINHA);
    folha.espaco(Math.max(...alturas) + 6);
    const topo = folha.y;
    let fundo = topo;
    trio.forEach((campo, j) => {
      folha.y = topo;
      const x = LADO + j * (larguraDaColuna + 12);
      folha.texto(campo.rotulo.toUpperCase(), { negrito: true, cor: CINZA_ROTULO, x, largura: larguraDaColuna });
      if (campo.valor.trim()) folha.texto(campo.valor, { x, largura: larguraDaColuna });
      else folha.y -= TEXTO * ENTRELINHA;
      fundo = Math.min(fundo, folha.y);
    });
    folha.y = fundo - 6;
  }

  if (detalhe.motivoDaCorretiva !== null) {
    folha.subtitulo("Motivo da visita corretiva");
    folha.texto(detalhe.motivoDaCorretiva);
  }

  if (consultoria) {
    folha.subtitulo(`Respostas (${detalhe.respostas.length} de ${linha.totalPerguntas})`);

    const cabecalhoDaTabela = () => {
      const altura = TEXTO * ENTRELINHA + 2 * RECUO;
      folha.espaco(altura + 20);
      let x = LADO;
      for (const coluna of COLUNAS) {
        folha.pagina.drawRectangle({ x, y: folha.y - altura, width: coluna.largura, height: altura, color: FUNDO_DO_CABECALHO, borderColor: BORDA, borderWidth: 0.6 });
        folha.pagina.drawText(paraWinAnsi(coluna.titulo), { x: x + RECUO, y: folha.y - RECUO - TEXTO, size: TEXTO, font: fontes.negrito, color: PRETO });
        x += coluna.largura;
      }
      folha.y -= altura;
    };
    cabecalhoDaTabela();

    for (const resposta of detalhe.respostas) {
      const celulas = [String(resposta.ordem ?? ""), resposta.pergunta, resposta.resposta, resposta.observacao ?? ""].map((valor, j) =>
        quebrarEmLinhas(valor, fontes.normal, TEXTO, COLUNAS[j].largura - 2 * RECUO),
      );
      const daPergunta = resposta.fotos.flatMap((foto) => imagemPorFoto.get(foto.id) ?? []);
      const porFileira = Math.max(1, Math.floor((COLUNAS[4].largura - 2 * RECUO + 4) / (MINIATURA + 4)));
      const alturaDasFotos = daPergunta.length > 0 ? Math.ceil(daPergunta.length / porFileira) * (MINIATURA + 4) - 4 : 0;
      const altura = Math.max(Math.max(...celulas.map((l) => l.length)) * TEXTO * ENTRELINHA, alturaDasFotos) + 2 * RECUO;

      // Linha que nao cabe vai inteira para a folha seguinte, com o cabecalho
      // da tabela repetido -- o `break-inside-avoid` da pagina impressa.
      if (!folha.cabe(altura)) {
        folha.espaco(ALTURA);
        cabecalhoDaTabela();
      }

      let x = LADO;
      COLUNAS.forEach((coluna, j) => {
        folha.pagina.drawRectangle({ x, y: folha.y - altura, width: coluna.largura, height: altura, borderColor: BORDA, borderWidth: 0.6 });
        if (j < 4) {
          celulas[j].forEach((linhaDoTexto, k) => {
            folha.pagina.drawText(linhaDoTexto, {
              x: x + RECUO,
              y: folha.y - RECUO - TEXTO - k * TEXTO * ENTRELINHA,
              size: TEXTO,
              font: fontes.normal,
              color: PRETO,
            });
          });
        } else {
          daPergunta.forEach((imagem, k) => {
            const coluna = k % porFileira;
            const fileira = Math.floor(k / porFileira);
            desenharMiniatura(folha.pagina, imagem, x + RECUO + coluna * (MINIATURA + 4), folha.y - RECUO - fileira * (MINIATURA + 4), MINIATURA);
          });
        }
        x += coluna.largura;
      });
      folha.y -= altura;
    }
  }

  const gerais = detalhe.fotos.flatMap((foto) => {
    const imagem = imagemPorFoto.get(foto.id);
    return imagem ? [{ imagem, legenda: formatarDataHora(foto.criadoEm) }] : [];
  });
  if (gerais.length > 0) {
    folha.subtitulo(consultoria ? "Fotos gerais" : "Fotos");
    const vao = 6;
    const porFileira = Math.max(1, Math.floor((UTIL + vao) / (FOTO_GERAL + vao)));
    const alturaDaFileira = FOTO_GERAL + 4 + 7 * ENTRELINHA;
    for (let i = 0; i < gerais.length; i += porFileira) {
      folha.espaco(alturaDaFileira + vao);
      gerais.slice(i, i + porFileira).forEach(({ imagem, legenda }, j) => {
        const x = LADO + j * (FOTO_GERAL + vao);
        desenharMiniatura(folha.pagina, imagem, x, folha.y, FOTO_GERAL);
        folha.pagina.drawText(paraWinAnsi(legenda), { x, y: folha.y - FOTO_GERAL - 4 - 7, size: 7, font: fontes.normal, color: CINZA_ROTULO });
      });
      folha.y -= alturaDaFileira + vao;
    }
  }

  if (assinatura) {
    folha.subtitulo("Assinatura do responsável no local");
    // `max-h-32` da tela: ate 96 pontos de altura, em preto sobre o papel.
    const ajuste = assinatura.scaleToFit(UTIL / 2, FOTO_GERAL);
    folha.espaco(ajuste.height);
    folha.pagina.drawImage(assinatura, { x: LADO, y: folha.y - ajuste.height, width: ajuste.width, height: ajuste.height });
    folha.y -= ajuste.height;
  }

  // Rodape da `TabelaImpressao` em toda folha: emissao a esquerda, "N de M" no centro.
  const emissao = paraWinAnsi(formatarEmissao(agora));
  const paginas = doc.getPages();
  paginas.forEach((pagina, indice) => {
    const y = BASE / 2;
    pagina.drawText(emissao, { x: LADO, y, size: 8, font: fontes.normal, color: RODAPE });
    const contador = `${indice + 1} de ${paginas.length}`;
    pagina.drawText(contador, { x: (LARGURA - fontes.normal.widthOfTextAtSize(contador, 8)) / 2, y, size: 8, font: fontes.normal, color: RODAPE });
  });

  return { arquivo: await doc.save(), nome: nomeDoArquivo(detalhe) };
}
