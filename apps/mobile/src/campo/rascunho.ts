import { Directory, File, Paths } from "expo-file-system";
import {
  LIMITE_OBSERVACAO,
  MAXIMO_DE_FOTOS,
  MAXIMO_DE_FOTOS_POR_PERGUNTA,
  RESPOSTAS_DO_CHECKLIST,
  type RespostaDoChecklist,
} from "@projeto-renatoo/shared";

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
  /**
   * O modelo escolhido (0061). `null` num rascunho anterior aos modelos, ou
   * antes de o inspetor escolher -- a tela escolhe sozinha quando o grupo so
   * tem um.
   */
  modeloId: number | null;
  /** Fotos de cada pergunta, pelo id da pergunta. */
  fotosDePergunta: Record<number, string[]>;
  /** Observacao de cada pergunta, pelo id da pergunta. So as preenchidas. */
  observacoes: Record<number, string>;
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
       (visita_id, funcionario_id, motivo, respostas, fotos, modelo_id, fotos_de_pergunta, observacoes, atualizado_em)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (visita_id) do update set
       funcionario_id = excluded.funcionario_id,
       motivo = excluded.motivo,
       respostas = excluded.respostas,
       fotos = excluded.fotos,
       modelo_id = excluded.modelo_id,
       fotos_de_pergunta = excluded.fotos_de_pergunta,
       observacoes = excluded.observacoes,
       atualizado_em = excluded.atualizado_em`,
    visitaId,
    funcionarioId,
    rascunho.motivo,
    JSON.stringify(rascunho.respostas),
    JSON.stringify(rascunho.fotos),
    rascunho.modeloId,
    JSON.stringify(rascunho.fotosDePergunta),
    JSON.stringify(rascunho.observacoes),
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
  const linha = await banco.getFirstAsync<{
    motivo: string;
    respostas: string;
    fotos: string;
    modelo_id: number | null;
    fotos_de_pergunta: string | null;
    observacoes: string | null;
  }>(
    `select motivo, respostas, fotos, modelo_id, fotos_de_pergunta, observacoes
       from rascunhos_de_checklist where visita_id = ? and funcionario_id = ?`,
    visitaId,
    funcionarioId,
  );

  if (!linha) return null;

  return {
    motivo: linha.motivo,
    respostas: respostasValidas(lerJson(linha.respostas)),
    fotos: fotosQueAindaExistem(lerJson(linha.fotos), MAXIMO_DE_FOTOS),
    modeloId: Number.isInteger(linha.modelo_id) ? linha.modelo_id : null,
    fotosDePergunta: fotosDePerguntaValidas(lerJson(linha.fotos_de_pergunta ?? "{}")),
    observacoes: observacoesValidas(lerJson(linha.observacoes ?? "{}")),
  };
}

/**
 * O checklist comecado numa RONDA (QR -> "Encerrar ronda" -> "Fazer checklist")
 * deste site que ainda nao foi enviado, se houver.
 *
 * POR QUE EXISTE (teste no tablet, 13/10/2026): o rascunho da ronda e guardado
 * pela visita, e o do "Ver sites" pelo site. Com o app reaberto, o unico
 * caminho de volta e o "Ver sites" -- que procurava o rascunho do site, vazio,
 * e as respostas da ronda ficavam no aparelho sem tela que as alcancasse. O
 * "Ver sites" pergunta isto antes de comecar um checklist novo.
 *
 * So rascunho com conteudo: a tela grava o rascunho vazio logo que abre, e
 * reabrir uma visita em que nada foi respondido nao ajuda ninguem.
 *
 * `comecadoDesde` (ISO): so visita cujo QR foi lido a partir dali. O QR passa
 * so o de hoje (decisao do dono, 23/10/2026): retomar um checklist esquecido
 * dias atras faria a visita durar dias no relatorio de Inicio e Fim. O "Ver
 * sites" nao passa nada, e continua achando qualquer data -- e o caminho de
 * volta para o que ficou para tras.
 */
export async function rascunhoDeRondaDoSite(
  siteId: number,
  funcionarioId: string,
  comecadoDesde?: string,
): Promise<{ visitaId: number; numeroColeta: string } | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ visita_id: number; chave: string }>(
    `select r.visita_id, v.chave
       from rascunhos_de_checklist r
       join visitas_na_fila v on v.visita_id = r.visita_id
      where r.visita_id > 0
        and r.funcionario_id = ?
        and v.site_id = ?
        and (r.respostas <> '{}' or r.motivo <> '' or r.fotos <> '[]'
             or ifnull(r.fotos_de_pergunta, '{}') <> '{}' or ifnull(r.observacoes, '{}') <> '{}')${
          comecadoDesde ? "\n        and v.capturado_em >= ?" : ""
        }
      order by r.atualizado_em desc
      limit 1`,
    funcionarioId,
    siteId,
    ...(comecadoDesde ? [comecadoDesde] : []),
  );
  return linha ? { visitaId: linha.visita_id, numeroColeta: linha.chave } : null;
}

/**
 * Meia-noite de hoje no relogio do aparelho, em ISO -- o mesmo formato do
 * `capturado_em` da fila (`toISOString`), entao a comparacao de texto vale.
 */
export function inicioDoDia(agora: Date = new Date()): string {
  const meiaNoite = new Date(agora);
  meiaNoite.setHours(0, 0, 0, 0);
  return meiaNoite.toISOString();
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

/** Texto por pergunta; vazio sai do mapa, e o que passar do teto do esquema e
 * cortado -- o envio recusaria o checklist inteiro por uma observacao longa. */
function observacoesValidas(valor: unknown): Record<number, string> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};

  const validas: Record<number, string> = {};
  for (const [chave, texto] of Object.entries(valor)) {
    const id = Number(chave);
    if (Number.isInteger(id) && typeof texto === "string" && texto.trim() !== "") {
      validas[id] = texto.slice(0, LIMITE_OBSERVACAO);
    }
  }
  return validas;
}

/** Mesmo filtro das fotos gerais, pergunta a pergunta; pergunta sem foto que
 * sobrou sai do mapa. */
function fotosDePerguntaValidas(valor: unknown): Record<number, string[]> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};

  const validas: Record<number, string[]> = {};
  for (const [chave, fotos] of Object.entries(valor)) {
    const id = Number(chave);
    if (!Number.isInteger(id)) continue;
    const existentes = fotosQueAindaExistem(fotos, MAXIMO_DE_FOTOS_POR_PERGUNTA);
    if (existentes.length > 0) validas[id] = existentes;
  }
  return validas;
}

function fotosQueAindaExistem(valor: unknown, teto: number): string[] {
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
    .slice(0, teto);
}
