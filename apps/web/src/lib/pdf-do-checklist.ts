import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Database } from "@projeto-renatoo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  camposDoResumo,
  getChecklistPeloCliente,
  TIPO_CONSULTORIA,
  type ChecklistDetalhe,
} from "@/app/dashboard/checklistlab/historico-de-checklist/queries";

/**
 * PDF de um checklist, para ir anexado ao aviso de inspecao (0080).
 *
 * POR QUE NO SERVIDOR. O PDF da tela sai do proprio navegador (`window.print`),
 * e um anexo de e-mail precisa existir sem ninguem com a tela aberta: a fila
 * roda sozinha, quando o inspetor envia o checklist. `pdf-lib` e JavaScript
 * puro -- sem Chrome, sem binario --, que e o que cabe numa funcao da Vercel.
 *
 * O conteudo e o da tela de detalhe do Historico, montado pela MESMA consulta
 * (`getChecklistPeloCliente`) e pelo MESMO resumo (`camposDoResumo`): o PDF e a
 * tela nao tem como mostrar coisas diferentes.
 *
 * As fotos e a assinatura vem do bucket privado pela service_role, e so entram
 * se forem JPEG ou PNG de verdade (pelos primeiros bytes, nao pelo tipo
 * declarado no upload -- o mesmo cuidado de `midia.ts`).
 */

const BUCKET = "checklists";

// A4 em pontos, margem de 1,4 cm.
const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 40;
const UTIL = LARGURA - 2 * MARGEM;

const COR_TEXTO = rgb(0.09, 0.13, 0.2);
const COR_SUAVE = rgb(0.35, 0.39, 0.47);
const COR_LINHA = rgb(0.85, 0.87, 0.9);
const COR_NAO_CONFORME = rgb(0.75, 0.11, 0.11);
const COR_CONFORME = rgb(0, 0.42, 0.21);

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

/** Folha com cursor: escreve de cima para baixo e abre outra quando acaba. */
class Folha {
  pagina: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly fontes: Fontes,
  ) {
    this.pagina = doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - MARGEM;
  }

  /** Garante `altura` livre antes de desenhar; senao, pagina nova. */
  espaco(altura: number) {
    if (this.y - altura >= MARGEM + 20) return;
    this.pagina = this.doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - MARGEM;
  }

  texto(conteudo: string, opcoes: { tamanho?: number; negrito?: boolean; cor?: ReturnType<typeof rgb>; x?: number; largura?: number } = {}) {
    const tamanho = opcoes.tamanho ?? 10;
    const fonte = opcoes.negrito ? this.fontes.negrito : this.fontes.normal;
    const x = opcoes.x ?? MARGEM;
    for (const linha of quebrarEmLinhas(conteudo, fonte, tamanho, opcoes.largura ?? UTIL - (x - MARGEM))) {
      this.espaco(tamanho + 4);
      this.pagina.drawText(linha, { x, y: this.y - tamanho, size: tamanho, font: fonte, color: opcoes.cor ?? COR_TEXTO });
      this.y -= tamanho + 4;
    }
  }

  titulo(conteudo: string) {
    this.espaco(40);
    this.y -= 10;
    this.texto(conteudo, { tamanho: 12, negrito: true });
    this.pagina.drawLine({
      start: { x: MARGEM, y: this.y },
      end: { x: LARGURA - MARGEM, y: this.y },
      thickness: 0.6,
      color: COR_LINHA,
    });
    this.y -= 8;
  }

  /** Imagens em grade, `porLinha` por fileira, cada uma ajustada a caixa. */
  imagens(lista: PDFImage[], porLinha = 3, alturaMaxima = 140) {
    const vao = 8;
    const largura = (UTIL - vao * (porLinha - 1)) / porLinha;
    for (let i = 0; i < lista.length; i += porLinha) {
      const fileira = lista.slice(i, i + porLinha).map((imagem) => imagem.scaleToFit(largura, alturaMaxima));
      const altura = Math.max(...fileira.map((d) => d.height));
      this.espaco(altura + vao);
      fileira.forEach((dimensao, j) => {
        this.pagina.drawImage(lista[i + j], {
          x: MARGEM + j * (largura + vao),
          y: this.y - dimensao.height,
          width: dimensao.width,
          height: dimensao.height,
        });
      });
      this.y -= altura + vao;
    }
  }
}

async function baixar(admin: Admin, caminho: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function embutir(doc: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  const tipo = tipoDaImagem(bytes);
  try {
    if (tipo === "jpg") return await doc.embedJpg(bytes);
    if (tipo === "png") return await doc.embedPng(bytes);
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
): Promise<{ arquivo: Uint8Array; nome: string } | null> {
  const detalhe = await getChecklistPeloCliente(admin, id);
  if (!detalhe) return null;

  // Os caminhos ficam fora do detalhe da tela de proposito (ver `midia.ts`):
  // aqui, com a service_role, sao lidos so para baixar os arquivos.
  const [{ data: fotos }, { data: checklist }] = await Promise.all([
    admin.from("checklist_fotos").select("id, storage_path, pergunta_id").eq("checklist_id", id).order("id"),
    admin.from("checklists_visita").select("assinatura_path").eq("id", id).maybeSingle(),
  ]);

  const doc = await PDFDocument.create();
  doc.setTitle(paraWinAnsi(`Checklist ${detalhe.linha.numeroAno || detalhe.linha.id}`));
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
  const assinatura = checklist?.assinatura_path
    ? await embutir(doc, await baixar(admin, checklist.assinatura_path))
    : null;

  const folha = new Folha(doc, fontes);
  const { linha } = detalhe;

  folha.texto("Up Serviços - Portal Operacional", { tamanho: 9, cor: COR_SUAVE });
  folha.y -= 2;
  folha.texto(`Checklist de ${linha.checklist} (${linha.numeroAno || `#${linha.id}`})`, { tamanho: 16, negrito: true });
  folha.y -= 6;

  // Resumo em duas colunas, rotulo em cima do valor, como a tela.
  const campos = camposDoResumo(detalhe).filter((campo) => campo.valor.trim() !== "");
  const larguraDaColuna = (UTIL - 16) / 2;
  for (let i = 0; i < campos.length; i += 2) {
    const par = campos.slice(i, i + 2);
    const alturas = par.map(
      (campo) => quebrarEmLinhas(campo.valor, fontes.normal, 10, larguraDaColuna).length * 14 + 12,
    );
    folha.espaco(Math.max(...alturas) + 6);
    const topo = folha.y;
    let fundo = topo;
    par.forEach((campo, j) => {
      folha.y = topo;
      const x = MARGEM + j * (larguraDaColuna + 16);
      folha.texto(campo.rotulo.toUpperCase(), { tamanho: 7, cor: COR_SUAVE, x, largura: larguraDaColuna });
      folha.texto(campo.valor, { tamanho: 10, x, largura: larguraDaColuna });
      fundo = Math.min(fundo, folha.y);
    });
    folha.y = fundo - 6;
  }

  if (detalhe.motivoDaCorretiva) {
    folha.titulo("Motivo da visita corretiva");
    folha.texto(detalhe.motivoDaCorretiva);
  }

  if (detalhe.respostas.length > 0) {
    folha.titulo(`Respostas (${detalhe.respostas.length} de ${linha.totalPerguntas})`);
    for (const resposta of detalhe.respostas) {
      folha.espaco(40);
      folha.texto(`${resposta.ordem ?? ""}${resposta.ordem === null ? "" : ". "}${resposta.pergunta}`, { negrito: true });
      // "Nao conforme" em vermelho e "Conforme" em verde; Sim/Nao fica neutro,
      // como na tela -- ali nao ha acerto nem falha.
      const cor =
        resposta.tipo === "SN" ? COR_TEXTO : resposta.valor === "NAO" ? COR_NAO_CONFORME : resposta.valor === "SIM" ? COR_CONFORME : COR_TEXTO;
      folha.texto(`Resposta: ${resposta.resposta}`, { cor });
      if (resposta.observacao?.trim()) folha.texto(`Observação: ${resposta.observacao.trim()}`, { cor: COR_SUAVE });
      const daPergunta = resposta.fotos.flatMap((foto) => imagemPorFoto.get(foto.id) ?? []);
      if (daPergunta.length > 0) {
        folha.y -= 2;
        folha.imagens(daPergunta, 4, 110);
      }
      folha.y -= 6;
    }
  }

  const gerais = detalhe.fotos.flatMap((foto) => imagemPorFoto.get(foto.id) ?? []);
  if (gerais.length > 0) {
    folha.titulo(`${linha.tipo === TIPO_CONSULTORIA ? "Fotos gerais" : "Fotos"} (${gerais.length})`);
    folha.imagens(gerais);
  }

  folha.titulo("Assinatura do responsável no local");
  if (assinatura) {
    // A assinatura e traco branco sobre transparente (o fundo escuro e da
    // tela do app): no papel branco ela sumiria, entao vai sobre um fundo
    // escuro, como no portal.
    const dimensao = assinatura.scaleToFit(260, 110);
    folha.espaco(dimensao.height + 16);
    folha.pagina.drawRectangle({
      x: MARGEM,
      y: folha.y - dimensao.height - 12,
      width: dimensao.width + 12,
      height: dimensao.height + 12,
      color: rgb(0.01, 0.01, 0.1),
    });
    folha.pagina.drawImage(assinatura, {
      x: MARGEM + 6,
      y: folha.y - dimensao.height - 6,
      width: dimensao.width,
      height: dimensao.height,
    });
    folha.y -= dimensao.height + 18;
  } else {
    folha.texto("Sem assinatura.", { cor: COR_SUAVE });
  }

  // Rodape em todas as paginas, depois de saber quantas sao.
  const paginas = doc.getPages();
  paginas.forEach((pagina, indice) => {
    const rodape = paraWinAnsi(`Checklist ${linha.numeroAno || linha.id}  |  Página ${indice + 1} de ${paginas.length}`);
    pagina.drawText(rodape, { x: MARGEM, y: MARGEM - 14, size: 8, font: fontes.normal, color: COR_SUAVE });
  });

  return { arquivo: await doc.save(), nome: nomeDoArquivo(detalhe) };
}
