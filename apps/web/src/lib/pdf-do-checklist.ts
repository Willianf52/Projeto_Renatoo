import "server-only";

import * as UPNGTipos from "@pdf-lib/upng";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { Database } from "@projeto-renatoo/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getChecklistPeloCliente,
  TIPO_CONSULTORIA,
  type ChecklistDetalhe,
} from "@/app/dashboard/checklistlab/historico-de-checklist/queries";
import { formatarDataEHoraSeparadas, formatarEmissao } from "@/lib/data-hora";
import { lerConfiguracaoDoCliente } from "@/lib/configuracao-do-cliente";
import { LOGO_PARA_PAPEL_PNG_BASE64 } from "@/lib/logo-para-papel";

/**
 * PDF de um checklist, para ir anexado ao aviso de inspecao (0080).
 *
 * NO MODELO DO SISTEMA ANTIGO (pedido do dono, 03/11/2026): copia o PDF que o
 * antigo manda aos gestores (um exemplo real, lido em 03/11/2026). Em toda
 * folha, o cabecalho com o logo, os dados da inspecao e a nota, e a faixa azul
 * com o nome do site; depois a barra cinza com o modelo e a nota; cada
 * pergunta com "Pergunta" a esquerda e "Resposta" a direita, as opcoes em
 * bolinhas (a escolhida cheia) e a observacao embaixo; "Anexos N" com as fotos
 * em grade; a assinatura em azul; e no rodape a emissao e "N de M".
 *
 * Diferencas que sao do sistema novo, e nao escolha: o app nao registra o
 * inicio do checklist separado do inicio da inspecao, nem o nome de quem
 * assinou, entao essas duas linhas nao aparecem.
 *
 * POR QUE NO SERVIDOR. A fila de e-mails roda sozinha, quando o inspetor envia
 * o checklist: nao ha navegador aberto para imprimir. `pdf-lib` e JavaScript
 * puro -- sem Chrome, sem binario --, que e o que cabe numa funcao da Vercel.
 *
 * As respostas vem da MESMA consulta da tela (`getChecklistPeloCliente`). Fotos
 * e assinatura vem do bucket privado pela service_role, e so entram se forem
 * JPEG ou PNG de verdade (pelos primeiros bytes -- o cuidado de `midia.ts`).
 */

// O pacote declara so exportacoes nomeadas, mas o modulo entrega tudo no
// `default` (e assim que o proprio pdf-lib o usa). Aceita as duas formas.
const UPNG = (UPNGTipos as unknown as { default?: typeof UPNGTipos }).default ?? UPNGTipos;

const BUCKET = "checklists";

// A4 em pontos.
const LARGURA = 595.28;
const ALTURA = 841.89;
const LADO = 14;
const UTIL = LARGURA - 2 * LADO;
const TOPO = 28;
const RODAPE = 52;

// Cores medidas no PDF do antigo.
const PRETO = rgb(0, 0, 0);
const AZUL_DA_FAIXA = rgb(0x02 / 255, 0x03 / 255, 0x6b / 255);
const CINZA_DA_BARRA = rgb(0x8a / 255, 0x8a / 255, 0x8a / 255);
const CINZA_DO_ROTULO = rgb(0.25, 0.25, 0.25);
const LINHA = rgb(0.75, 0.75, 0.75);
const BRANCO = rgb(1, 1, 1);
const AZUL_DA_ASSINATURA = { r: 0x1a, g: 0x4f, b: 0xb0 };

const TEXTO = 9.5;
const ROTULO = 7;
const ENTRELINHA = 1.3;

/** Coluna da pergunta e coluna da resposta, como no antigo. */
const COLUNA_PERGUNTA = { x: LADO + 4, largura: 300 };
const COLUNA_RESPOSTA = { x: LADO + 316, largura: UTIL - 320 };

/** Grade dos anexos: cinco por fileira, retrato. */
const FOTOS_POR_FILEIRA = 5;
const FOTO = { largura: 92, altura: 124 };

type Admin = SupabaseClient<Database>;
type Fontes = { normal: PDFFont; negrito: PDFFont };

/** Opcoes de cada tipo de pergunta, na ordem do antigo. */
const OPCOES: Record<string, { valor: string; rotulo: string }[]> = {
  CNA: [
    { valor: "SIM", rotulo: "Conforme" },
    { valor: "NAO", rotulo: "Não conforme" },
    { valor: "NA", rotulo: "Não se aplica" },
  ],
  SN: [
    { valor: "SIM", rotulo: "Sim" },
    { valor: "NAO", rotulo: "Não" },
  ],
};

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
 * Pinta todos os pixels visiveis de um PNG com uma cor so, mantendo a
 * transparencia. A assinatura vem do app em traco BRANCO sobre transparente
 * (feita para o fundo escuro), e no papel sumiria: o antigo a mostra em azul.
 */
export function pintarPng(png: Uint8Array, cor: { r: number; g: number; b: number }): Uint8Array {
  const imagem = UPNG.decode(png.slice().buffer as ArrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(imagem)[0]);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = cor.r;
    rgba[i + 1] = cor.g;
    rgba[i + 2] = cor.b;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], imagem.width, imagem.height, 0));
}

/** "100,00": a nota como o antigo escreve. */
export function notaComVirgula(nota: number): string {
  return nota.toFixed(2).replace(".", ",");
}

/** Endereco numa linha so, sem as partes vazias. */
export function enderecoDoSite(site: {
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}): string {
  const rua = [site.endereco?.trim(), site.numero?.trim()].filter(Boolean).join(", ");
  const comBairro = [rua, site.bairro?.trim()].filter(Boolean).join(" - ");
  return [comBairro, site.cidade?.trim(), site.uf?.trim()].filter(Boolean).join(", ");
}

/** "02/11/2026 17:56:08": data e hora com segundos, como o cabecalho do antigo. */
function dataHoraComSegundos(valor: string | null): string {
  const { data, hora } = formatarDataEHoraSeparadas(valor);
  return `${data} ${hora}`.trim();
}

/** Nome do arquivo anexado, sem acento nem espaco: alguns clientes de e-mail estragam. */
export function nomeDoArquivo(detalhe: Pick<ChecklistDetalhe, "linha">): string {
  const numero = detalhe.linha.numeroAno.replace(/[^0-9]+/g, "-").replace(/^-|-$/g, "") || String(detalhe.linha.id);
  return `checklist-${numero}.pdf`;
}

/** Os dados do cabecalho, repetido em toda folha. */
type Cabecalho = {
  site: string;
  /** "Titulo do PDF" (Cadastros > Cliente, 0085): na faixa, antes do site. */
  titulo: string;
  endereco: string;
  responsavel: string;
  idDaInspecao: string;
  inicio: string;
  termino: string;
  numeroAno: string;
  finalizacao: string;
  nota: string | null;
};

/** Folha com cursor: abre pagina com o cabecalho e escreve de cima para baixo. */
class Folha {
  pagina!: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fontes: Fontes,
    private readonly cabecalho: Cabecalho,
    private readonly logo: PDFImage | null,
  ) {
    this.novaPagina();
  }

  novaPagina() {
    this.pagina = this.doc.addPage([LARGURA, ALTURA]);
    this.y = ALTURA - TOPO;
    this.desenharCabecalho();
  }

  /** Garante `altura` livre; senao, pagina nova (com o cabecalho). */
  espaco(altura: number) {
    if (this.y - altura < RODAPE) this.novaPagina();
  }

  escrever(texto: string, x: number, y: number, opcoes: { tamanho?: number; negrito?: boolean; cor?: RGB } = {}) {
    this.pagina.drawText(paraWinAnsi(texto), {
      x,
      y,
      size: opcoes.tamanho ?? TEXTO,
      font: opcoes.negrito ? this.fontes.negrito : this.fontes.normal,
      color: opcoes.cor ?? PRETO,
    });
  }

  /** Paragrafo quebrado na largura; devolve quanto desceu. */
  paragrafo(texto: string, x: number, topo: number, largura: number, tamanho = TEXTO): number {
    const linhas = quebrarEmLinhas(texto, this.fontes.normal, tamanho, largura);
    linhas.forEach((linha, i) => this.escrever(linha, x, topo - tamanho - i * tamanho * ENTRELINHA, { tamanho }));
    return linhas.length * tamanho * ENTRELINHA;
  }

  separador(espessura = 0.6) {
    this.pagina.drawLine({ start: { x: LADO, y: this.y }, end: { x: LARGURA - LADO, y: this.y }, thickness: espessura, color: LINHA });
  }

  /** "Rotulo: valor" com o rotulo em negrito, a partir de `x`; devolve onde parou. */
  private campo(rotulo: string, valor: string, x: number, y: number): number {
    this.escrever(rotulo, x, y, { negrito: true });
    const depois = x + this.fontes.negrito.widthOfTextAtSize(paraWinAnsi(rotulo), TEXTO) + 3;
    this.escrever(valor, depois, y);
    return depois + this.fontes.normal.widthOfTextAtSize(paraWinAnsi(valor), TEXTO);
  }

  private desenharCabecalho() {
    const c = this.cabecalho;
    const topo = this.y;

    if (this.logo) {
      const ajuste = this.logo.scaleToFit(62, 62);
      this.pagina.drawImage(this.logo, { x: LADO + 12, y: topo - 6 - ajuste.height, width: ajuste.width, height: ajuste.height });
    }

    const x = LADO + 132;
    const passo = TEXTO * 1.32;
    let y = topo - TEXTO;
    this.campo("Site:", c.site, x, y);
    y -= passo;
    this.campo("Endereço:", c.endereco, x, y);
    y -= passo;
    this.campo("Responsável:", c.responsavel, x, y);
    y -= passo;
    this.campo("ID inspeção:", c.idDaInspecao, x, y);
    y -= passo;
    const fimDoInicio = this.campo("Início da Inspeção:", c.inicio, x, y);
    this.campo("- Término da Inspeção:", c.termino, fimDoInicio + 3, y);
    y -= passo;
    this.campo("Número / Ano:", c.numeroAno, x, y);
    y -= passo;
    this.campo("Finalização do Checklist:", c.finalizacao, x, y);

    if (c.nota !== null) {
      const largura = (texto: string, fonte: PDFFont) => fonte.widthOfTextAtSize(texto, TEXTO);
      this.escrever("Nota", LARGURA - LADO - largura("Nota", this.fontes.negrito), topo - TEXTO, { negrito: true });
      this.escrever(c.nota, LARGURA - LADO - largura(c.nota, this.fontes.normal), topo - TEXTO - passo);
    }

    // Faixa azul com o nome do site.
    const faixa = 20;
    const yDaFaixa = y - 18 - faixa;
    this.pagina.drawRectangle({ x: LADO, y: yDaFaixa, width: UTIL, height: faixa, color: AZUL_DA_FAIXA });
    const nome = paraWinAnsi(c.titulo ? `${c.titulo} - ${c.site}` : c.site);
    const tamanho = 11;
    this.escrever(nome, (LARGURA - this.fontes.negrito.widthOfTextAtSize(nome, tamanho)) / 2, yDaFaixa + 6, {
      tamanho,
      negrito: true,
      cor: BRANCO,
    });
    this.y = yDaFaixa - 2;
    this.pagina.drawLine({ start: { x: LADO, y: this.y - 8 }, end: { x: LARGURA - LADO, y: this.y - 8 }, thickness: 0.8, color: LINHA });
    this.y -= 10;
  }
}

/** Uma imagem ajustada dentro da caixa, encostada no alto, como no antigo. */
function desenharFoto(pagina: PDFPage, imagem: PDFImage, x: number, topo: number) {
  const ajuste = imagem.scaleToFit(FOTO.largura, FOTO.altura);
  pagina.drawImage(imagem, { x, y: topo - ajuste.height, width: ajuste.width, height: ajuste.height });
  return ajuste.height;
}

/** "Anexos N" e as fotos em grade, cinco por fileira, com a legenda embaixo. */
function desenharAnexos(folha: Folha, fotos: PDFImage[], comLegenda = true) {
  if (fotos.length === 0) return;
  folha.espaco(ROTULO * 2 + FOTO.altura + 20);
  folha.escrever(`Anexos ${fotos.length}`, LADO + 8, folha.y - ROTULO - 4, { tamanho: ROTULO, cor: CINZA_DO_ROTULO });
  folha.y -= ROTULO + 14;

  const vao = (UTIL - 16 - FOTOS_POR_FILEIRA * FOTO.largura) / (FOTOS_POR_FILEIRA - 1);
  for (let i = 0; i < fotos.length; i += FOTOS_POR_FILEIRA) {
    folha.espaco(FOTO.altura + 18);
    let maisAlta = 0;
    fotos.slice(i, i + FOTOS_POR_FILEIRA).forEach((imagem, j) => {
      const x = LADO + 8 + j * (FOTO.largura + vao);
      const altura = desenharFoto(folha.pagina, imagem, x, folha.y);
      // "Legenda nas Imagens" (Cadastros > Cliente, 0085).
      if (comLegenda) folha.escrever("Foto", x, folha.y - altura - 10, { tamanho: 8.5 });
      maisAlta = Math.max(maisAlta, altura);
    });
    folha.y -= maisAlta + 22;
  }
  folha.y -= 2;
  folha.separador();
  folha.y -= 4;
}

/** Bolinha de opcao: vazia, ou com o miolo cheio quando e a escolhida. */
function desenharOpcao(pagina: PDFPage, x: number, y: number, escolhida: boolean) {
  pagina.drawCircle({ x, y, size: 3.4, borderColor: PRETO, borderWidth: 0.7 });
  if (escolhida) pagina.drawCircle({ x, y, size: 1.8, color: PRETO });
}

async function baixar(admin: Admin, caminho: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function embutir(doc: PDFDocument, bytes: Uint8Array | null, tratar?: (png: Uint8Array) => Uint8Array): Promise<PDFImage | null> {
  if (!bytes) return null;
  const tipo = tipoDaImagem(bytes);
  try {
    if (tipo === "jpg") return await doc.embedJpg(bytes);
    if (tipo === "png") return await doc.embedPng(tratar ? tratar(bytes) : bytes);
  } catch {
    // Arquivo corrompido: fica de fora, o resto do PDF segue.
  }
  return null;
}

type DadosDaVisita = {
  id: number;
  criado_em: string;
  sites: { nome: string; endereco: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null } | null;
  leituras: { data_hora: string; qr_code_id: number | null; area_id: number | null }[];
};

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

  // Caminhos dos arquivos, endereco do site e horarios da inspecao: o que o
  // cabecalho do antigo mostra e o detalhe da tela nao traz.
  const [{ data: fotos }, { data: checklist }, { data: visita }] = await Promise.all([
    admin.from("checklist_fotos").select("id, storage_path, pergunta_id").eq("checklist_id", id).order("id"),
    admin.from("checklists_visita").select("assinatura_path, criado_em").eq("id", id).maybeSingle(),
    admin
      .from("visitas")
      .select("id, criado_em, sites ( nome, endereco, numero, bairro, cidade, uf ), leituras ( data_hora, qr_code_id, area_id )")
      .eq("id", detalhe.visitaId)
      .maybeSingle(),
  ]);

  const { linha } = detalhe;
  const consultoria = linha.tipo === TIPO_CONSULTORIA;
  const dadosDaVisita = visita as unknown as DadosDaVisita | null;
  const leituras = [...(dadosDaVisita?.leituras ?? [])].sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  // Inicio: a leitura do QR (a primeira). Termino: a leitura da area
  // "Termino" (0077), que nasce no envio; sem ela, o proprio envio.
  const inicio = leituras.find((l) => l.qr_code_id !== null)?.data_hora ?? leituras[0]?.data_hora ?? dadosDaVisita?.criado_em ?? linha.enviadoEm;
  const termino = [...leituras].reverse().find((l) => l.area_id !== null)?.data_hora ?? checklist?.criado_em ?? linha.enviadoEm;

  const config = await lerConfiguracaoDoCliente(admin);
  const doc = await PDFDocument.create();
  doc.setTitle(paraWinAnsi(`${dadosDaVisita?.sites?.nome ?? linha.site} ${linha.numeroAno || linha.id}`));
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
    checklist?.assinatura_path
      ? baixar(admin, checklist.assinatura_path).then((b) => embutir(doc, b, (png) => pintarPng(png, AZUL_DA_ASSINATURA)))
      : null,
    embutir(doc, Uint8Array.from(Buffer.from(LOGO_PARA_PAPEL_PNG_BASE64, "base64"))),
  ]);

  const nota = linha.nota === null ? null : notaComVirgula(linha.nota);
  const site = dadosDaVisita?.sites?.nome ?? linha.site;
  const folha = new Folha(
    doc,
    fontes,
    {
      site,
      titulo: config.tituloPdf,
      endereco: dadosDaVisita?.sites ? enderecoDoSite(dadosDaVisita.sites) : "",
      responsavel: linha.responsavel,
      idDaInspecao: String(detalhe.visitaId),
      inicio: dataHoraComSegundos(inicio),
      termino: dataHoraComSegundos(termino),
      numeroAno: linha.numeroAno,
      finalizacao: dataHoraComSegundos(checklist?.criado_em ?? linha.enviadoEm),
      nota,
    },
    logo,
  );

  // Barra cinza: o modelo (ou "Corretiva") e a nota.
  const barra = 14;
  folha.espaco(barra + 40);
  folha.pagina.drawRectangle({ x: LADO, y: folha.y - barra, width: UTIL, height: barra, color: CINZA_DA_BARRA });
  folha.escrever(consultoria ? linha.modelo || "Consultoria" : "Corretiva", LADO + 2, folha.y - barra + 4, { cor: BRANCO });
  if (nota !== null) {
    const texto = `Nota: ${nota}`;
    folha.escrever(texto, LARGURA - LADO - 2 - fontes.normal.widthOfTextAtSize(texto, TEXTO), folha.y - barra + 4, { cor: BRANCO });
  }
  folha.y -= barra + 2;

  if (detalhe.motivoDaCorretiva !== null) {
    const altura = ROTULO + quebrarEmLinhas(detalhe.motivoDaCorretiva, fontes.normal, TEXTO, UTIL - 8).length * TEXTO * ENTRELINHA + 10;
    folha.espaco(altura);
    folha.escrever("Motivo", LADO + 4, folha.y - ROTULO - 2, { tamanho: ROTULO, cor: CINZA_DO_ROTULO });
    folha.y -= folha.paragrafo(detalhe.motivoDaCorretiva, LADO + 4, folha.y - ROTULO - 4, UTIL - 8) + ROTULO + 8;
    folha.separador();
    folha.y -= 2;
  }

  for (const resposta of detalhe.respostas) {
    const opcoes = OPCOES[resposta.tipo] ?? OPCOES.CNA;
    const alturaDaPergunta = quebrarEmLinhas(resposta.pergunta, fontes.normal, TEXTO, COLUNA_PERGUNTA.largura).length * TEXTO * ENTRELINHA;
    const alturaDasOpcoes = opcoes.length * TEXTO * ENTRELINHA;
    const observacao = resposta.observacao?.trim() ?? "";
    const alturaDaObservacao = observacao
      ? ROTULO + 8 + quebrarEmLinhas(observacao, fontes.normal, TEXTO, COLUNA_RESPOSTA.largura).length * TEXTO * ENTRELINHA
      : 0;
    const altura = ROTULO + 4 + Math.max(alturaDaPergunta, alturaDasOpcoes + alturaDaObservacao) + 8;

    folha.espaco(altura);
    const topo = folha.y - 2;
    folha.escrever("Pergunta", COLUNA_PERGUNTA.x, topo - ROTULO, { tamanho: ROTULO, cor: CINZA_DO_ROTULO });
    folha.paragrafo(resposta.pergunta, COLUNA_PERGUNTA.x, topo - ROTULO - 2, COLUNA_PERGUNTA.largura);

    folha.escrever("Resposta", COLUNA_RESPOSTA.x, topo - ROTULO, { tamanho: ROTULO, cor: CINZA_DO_ROTULO });
    opcoes.forEach((opcao, i) => {
      const y = topo - ROTULO - 2 - TEXTO - i * TEXTO * ENTRELINHA;
      desenharOpcao(folha.pagina, COLUNA_RESPOSTA.x + 4, y + 3, resposta.valor === opcao.valor);
      folha.escrever(opcao.rotulo, COLUNA_RESPOSTA.x + 12, y);
    });

    if (observacao) {
      const yDaObservacao = topo - ROTULO - 2 - alturaDasOpcoes - 6;
      folha.escrever("Observação", COLUNA_RESPOSTA.x + 4, yDaObservacao - ROTULO, { tamanho: ROTULO, cor: CINZA_DO_ROTULO });
      const desceu = folha.paragrafo(observacao, COLUNA_RESPOSTA.x + 4, yDaObservacao - ROTULO - 2, COLUNA_RESPOSTA.largura);
      const yDaLinha = yDaObservacao - ROTULO - 4 - desceu;
      folha.pagina.drawLine({ start: { x: COLUNA_RESPOSTA.x + 4, y: yDaLinha }, end: { x: LARGURA - LADO, y: yDaLinha }, thickness: 0.4, color: LINHA });
    }

    folha.y -= altura;
    folha.separador();
    folha.y -= 2;

    desenharAnexos(
      folha,
      resposta.fotos.flatMap((foto) => imagemPorFoto.get(foto.id) ?? []),
      config.legendaNasImagens,
    );
  }

  // Fotos gerais: o antigo so tem anexo por pergunta; aqui elas vem depois,
  // no mesmo formato.
  const gerais = detalhe.fotos.flatMap((foto) => imagemPorFoto.get(foto.id) ?? []);
  if (gerais.length > 0) {
    // O titulo vai junto da primeira fileira: sozinho no pe da folha, ele
    // ficava separado das fotos (visto na amostra de 03/11/2026).
    folha.espaco(TEXTO + 6 + ROTULO + 14 + FOTO.altura + 22);
    folha.escrever(consultoria ? "Fotos gerais" : "Fotos", LADO + 4, folha.y - TEXTO - 2, { negrito: true });
    folha.y -= TEXTO + 6;
    desenharAnexos(folha, gerais, config.legendaNasImagens);
  }

  folha.espaco(ROTULO + 20);
  folha.escrever("Observações", LADO + 4, folha.y - TEXTO - 2);
  folha.y -= TEXTO + 14;

  if (assinatura) {
    const ajuste = assinatura.scaleToFit(UTIL / 2 - 20, 110);
    folha.espaco(ajuste.height + 40);
    const x = LADO + (UTIL / 2 - ajuste.width) / 2;
    folha.pagina.drawImage(assinatura, { x, y: folha.y - ajuste.height, width: ajuste.width, height: ajuste.height });
    const legenda = "Assinatura do responsável no local";
    folha.escrever(legenda, LADO + (UTIL / 2 - fontes.normal.widthOfTextAtSize(paraWinAnsi(legenda), 8.5)) / 2, folha.y - ajuste.height - 18, {
      tamanho: 8.5,
    });
    folha.y -= ajuste.height + 26;
  }

  // Rodape do antigo em toda folha: linha, emissao a esquerda, "N de M" no centro.
  const emissao = paraWinAnsi(formatarEmissao(agora));
  const paginas = doc.getPages();
  paginas.forEach((pagina, indice) => {
    const y = 30;
    pagina.drawLine({ start: { x: LADO, y: y + 10 }, end: { x: LARGURA - LADO, y: y + 10 }, thickness: 0.6, color: PRETO });
    pagina.drawText(emissao, { x: LADO, y, size: 7, font: fontes.normal, color: PRETO });
    const contador = `${indice + 1} de ${paginas.length}`;
    pagina.drawText(contador, { x: (LARGURA - fontes.normal.widthOfTextAtSize(contador, 7)) / 2, y, size: 7, font: fontes.normal, color: PRETO });
  });

  return { arquivo: await doc.save(), nome: nomeDoArquivo(detalhe) };
}
