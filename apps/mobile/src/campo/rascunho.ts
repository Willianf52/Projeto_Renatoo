import { Directory, File, Paths } from "expo-file-system";
import { MAXIMO_DE_FOTOS, RESPOSTAS_DO_CHECKLIST, type RespostaDoChecklist } from "@projeto-renatoo/shared";

import { abrirFila } from "./fila";

/**
 * O checklist em preenchimento, guardado no aparelho enquanto o inspetor
 * responde.
 *
 * Antes disto o formulario vivia so em estado de React: o app morto pelo
 * sistema no meio do preenchimento (camera abriu, memoria acabou, ligacao
 * entrou) levava junto motivo, respostas e fotos -- e o inspetor recomecava
 * em pe, na frente do responsavel. A fila (`fila.ts`) ja resolvia isso para
 * as leituras; o checklist tinha ficado de fora.
 *
 * A ASSINATURA NAO ENTRA, de proposito: ela e o aceite do responsavel sobre o
 * que esta na tela no momento em que ele assina. Restaurar um traco antigo
 * sobre respostas que podem ter mudado depois seria um aceite que ninguem deu.
 *
 * AS FOTOS SAO COPIADAS. O `expo-image-picker` devolve um arquivo no cache do
 * app, e o cache e exatamente o que o sistema limpa quando falta espaco. O
 * rascunho apontando para la sobreviveria ao app morto e perderia as fotos do
 * mesmo jeito. A copia vai para `Paths.document`, que o sistema nao toca.
 */

export type Rascunho = {
  motivo: string;
  respostas: Record<number, RespostaDoChecklist>;
  fotos: string[];
};

function pastaDaVisita(visitaId: number): Directory {
  return new Directory(Paths.document, "rascunhos", String(visitaId));
}

export async function salvarRascunho(
  visitaId: number,
  funcionarioId: string,
  rascunho: Rascunho,
): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    `insert into rascunhos_de_checklist
       (visita_id, funcionario_id, motivo, respostas, fotos, atualizado_em)
     values (?, ?, ?, ?, ?, ?)
     on conflict (visita_id) do update set
       funcionario_id = excluded.funcionario_id,
       motivo = excluded.motivo,
       respostas = excluded.respostas,
       fotos = excluded.fotos,
       atualizado_em = excluded.atualizado_em`,
    visitaId,
    funcionarioId,
    rascunho.motivo,
    JSON.stringify(rascunho.respostas),
    JSON.stringify(rascunho.fotos),
    new Date().toISOString(),
  );
}

/**
 * O rascunho desta visita, se for do inspetor da sessao.
 *
 * Tudo que sai do disco e conferido: JSON corrompido vira rascunho vazio (e
 * nao excecao na abertura da tela), resposta fora do dominio e descartada, e
 * foto cujo arquivo sumiu nao volta para a tela -- mostrar a miniatura quebrada
 * e depois falhar o upload seria pior que simplesmente pedir a foto de novo.
 */
export async function lerRascunho(visitaId: number, funcionarioId: string): Promise<Rascunho | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ motivo: string; respostas: string; fotos: string }>(
    "select motivo, respostas, fotos from rascunhos_de_checklist where visita_id = ? and funcionario_id = ?",
    visitaId,
    funcionarioId,
  );

  if (!linha) return null;

  return {
    motivo: linha.motivo,
    respostas: respostasValidas(lerJson(linha.respostas)),
    fotos: fotosQueAindaExistem(lerJson(linha.fotos)),
  };
}

/** Apaga o rascunho e as fotos copiadas. Chamado quando o checklist chega ao banco. */
export async function descartarRascunho(visitaId: number): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync("delete from rascunhos_de_checklist where visita_id = ?", visitaId);

  const pasta = pastaDaVisita(visitaId);
  if (pasta.exists) pasta.delete();
}

/**
 * Copia a foto da camera para a pasta do rascunho e devolve o novo endereco.
 *
 * Se a copia falhar (disco cheio, por exemplo), devolve o endereco original:
 * a foto continua servindo para ESTE envio, so nao sobrevive ao app morto. Nao
 * vale travar o inspetor por causa de uma garantia extra.
 */
export async function guardarFoto(visitaId: number, uriDaCamera: string): Promise<string> {
  try {
    const pasta = pastaDaVisita(visitaId);
    pasta.create({ intermediates: true, idempotent: true });

    const destino = new File(pasta, `foto-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`);
    await new File(uriDaCamera).copy(destino);
    return destino.uri;
  } catch {
    return uriDaCamera;
  }
}

/** Apaga a copia de uma foto removida da tela. So toca no que e do rascunho. */
export function esquecerFoto(visitaId: number, uri: string): void {
  try {
    if (!uri.startsWith(pastaDaVisita(visitaId).uri)) return;
    const arquivo = new File(uri);
    if (arquivo.exists) arquivo.delete();
  } catch {
    // Arquivo que nao apaga e lixo no disco, nao falha de fluxo.
  }
}

function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function respostasValidas(valor: unknown): Record<number, RespostaDoChecklist> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};

  const validas: Record<number, RespostaDoChecklist> = {};
  for (const [chave, resposta] of Object.entries(valor)) {
    const id = Number(chave);
    if (Number.isInteger(id) && (RESPOSTAS_DO_CHECKLIST as readonly unknown[]).includes(resposta)) {
      validas[id] = resposta as RespostaDoChecklist;
    }
  }
  return validas;
}

function fotosQueAindaExistem(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];

  return valor
    .filter((uri): uri is string => {
      if (typeof uri !== "string") return false;
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    })
    .slice(0, MAXIMO_DE_FOTOS);
}
