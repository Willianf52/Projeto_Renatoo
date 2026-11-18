import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link assinado do PDF de um checklist, para o app de campo (18/11/2026).
 *
 * O app nao tem cookie de sessao do portal, e o navegador do celular, que e
 * quem abre o PDF, nao recebe o token do app. Entao o app pede o link
 * (`/api/app/checklists/[id]/link-do-pdf`, com o token dele) e o portal, depois
 * de conferir pelo RLS que a pessoa enxerga o checklist, devolve um endereco
 * que vale para AQUELE checklist e por POUCO TEMPO. Quem abre o endereco
 * (`/api/app/pdf/[token]`) nao precisa estar logado: a assinatura e a prova.
 *
 * O token vai no caminho, e nao em parametro de busca: `id.expira.assinatura`,
 * com a assinatura HMAC-SHA256 de `id.expira`. Nada de dado pessoal nele, so o
 * numero do checklist e a hora.
 *
 * A CHAVE e derivada da service_role (HMAC com um rotulo fixo), para nao
 * exigir mais uma variavel de ambiente na Vercel. Quem tem a service_role ja
 * le o banco inteiro; trocar a service_role invalida os links abertos, que de
 * todo modo vivem 5 minutos.
 */

export const VALIDADE_DO_LINK_MS = 5 * 60_000;

const ROTULO = "link-do-pdf-do-checklist-v1";

export function chaveDoLink(serviceRole: string): Buffer {
  return createHmac("sha256", serviceRole).update(ROTULO).digest();
}

function assinatura(conteudo: string, chave: Buffer): string {
  return createHmac("sha256", chave).update(conteudo).digest("base64url");
}

export function assinarLinkDoPdf(checklistId: number, chave: Buffer, agora: number = Date.now()): string {
  const conteudo = `${checklistId}.${agora + VALIDADE_DO_LINK_MS}`;
  return `${conteudo}.${assinatura(conteudo, chave)}`;
}

/** O id do checklist, se o token for valido e nao tiver vencido; senao nulo. */
export function lerLinkDoPdf(token: string, chave: Buffer, agora: number = Date.now()): number | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [idTexto, expiraTexto, recebida] = partes;
  if (!/^\d{1,15}$/.test(idTexto) || !/^\d{1,15}$/.test(expiraTexto)) return null;

  const esperada = Buffer.from(assinatura(`${idTexto}.${expiraTexto}`, chave));
  const veio = Buffer.from(recebida);
  // Comparacao em tempo constante: tamanhos diferentes ja reprovam, e o
  // timingSafeEqual exige o mesmo tamanho.
  if (veio.length !== esperada.length || !timingSafeEqual(veio, esperada)) return null;

  const expira = Number(expiraTexto);
  // Um link "do futuro distante" so sai daqui se a chave vazou; mesmo assim,
  // nada vale mais que a validade.
  if (expira < agora || expira > agora + VALIDADE_DO_LINK_MS) return null;

  const id = Number(idTexto);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
