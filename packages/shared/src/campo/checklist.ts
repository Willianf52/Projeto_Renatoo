import { z } from "zod";
import type { TablesInsert } from "../database-types";
import {
  LIMITE_MOTIVO,
  LIMITE_OBSERVACAO,
  MAXIMO_DE_FOTOS,
  MINIMO_DE_FOTOS,
} from "./regras";

/**
 * Contrato do checklist com que o app de campo fecha uma visita.
 *
 * Irmao de `esquemas.ts` e pelo mesmo motivo: e a *unica* descricao da regra,
 * lida pelo app dos inspetores e pelo painel web. O que muda aqui e a forma --
 * as duas opcoes da tela ("Visita Corretiva" e "Consultoria") nao sao dois
 * conjuntos de campos opcionais no mesmo objeto, e sim uma uniao discriminada
 * por `tipo`.
 *
 * A diferenca importa. Com campos opcionais, "corretiva sem motivo" e
 * "consultoria com motivo" seriam os dois representaveis, e a checagem viraria
 * um `if` solto em algum lugar da tela. Com a uniao, o TypeScript recusa os
 * dois **antes** de o zod rodar -- e o check `checklists_visita_motivo_por_tipo`
 * (migration 0042) recusa de novo no banco, para o caso de um app antigo em
 * campo tentar mesmo assim.
 *
 * Normaliza alem de validar, como em `esquemas.ts`: texto perde espaco das
 * bordas e string vazia vira `null`.
 */

export const TIPOS_DE_VISITA = ["CORRETIVA", "CONSULTORIA"] as const;
export type TipoDeVisita = (typeof TIPOS_DE_VISITA)[number];

/**
 * `NA` existe porque todo checklist de campo tem item que nao se aplica ao
 * site visitado. Sem essa terceira saida o inspetor responde SIM ou NAO a algo
 * que nao existe no local so para conseguir enviar -- e a resposta falsa entra
 * no relatorio indistinguivel de uma verdadeira.
 */
export const RESPOSTAS_DO_CHECKLIST = ["SIM", "NAO", "NA"] as const;
export type RespostaDoChecklist = (typeof RESPOSTAS_DO_CHECKLIST)[number];

/** Rotulo de tela, aqui e nao na tela: o painel mostra os mesmos tres. */
export const ROTULO_DA_RESPOSTA: Record<RespostaDoChecklist, string> = {
  SIM: "Conforme",
  NAO: "Não conforme",
  NA: "Não se aplica",
};

export const ROTULO_DO_TIPO: Record<TipoDeVisita, string> = {
  CORRETIVA: "Visita Corretiva",
  CONSULTORIA: "Consultoria",
};

const referencia = (rotulo: string) =>
  z
    .number({ error: `${rotulo} deve ser um número.` })
    .int(`${rotulo} deve ser um número inteiro.`)
    .positive(`${rotulo} deve ser um número positivo.`);

const textoObrigatorio = (rotulo: string, limite: number) =>
  z
    .string({ error: `${rotulo} é obrigatório.` })
    .trim()
    .min(1, `${rotulo} é obrigatório.`)
    .max(limite, `${rotulo} deve ter no máximo ${limite} caracteres.`);

const textoOpcional = (rotulo: string, limite: number) =>
  z
    .string({ error: `${rotulo} deve ser texto.` })
    .trim()
    .max(limite, `${rotulo} deve ter no máximo ${limite} caracteres.`)
    .nullish()
    .transform((valor) => (valor === undefined || valor === null || valor === "" ? null : valor));

/**
 * Caminho dentro do bucket `checklists`, no formato `{visita_id}/{arquivo}`.
 *
 * A primeira pasta e a chave de autorizacao da policy de storage da 0042 --
 * por isso o formato e validado aqui e nao so montado na tela: um caminho sem
 * a pasta numerica seria recusado pelo Storage com um erro que nao explica
 * nada a quem esta em campo.
 */
const CAMINHO_DE_MIDIA = /^\d+\/[A-Za-z0-9._-]+$/;

const caminhoDeMidia = (rotulo: string) =>
  z
    .string({ error: `${rotulo} é obrigatório.` })
    .trim()
    .min(1, `${rotulo} é obrigatório.`)
    .regex(CAMINHO_DE_MIDIA, `${rotulo} não está no formato esperado.`);

export const esquemaDeRespostaDoChecklist = z.object({
  perguntaId: referencia("A pergunta"),
  resposta: z.enum(RESPOSTAS_DO_CHECKLIST, { error: "Responda a pergunta." }),
  observacao: textoOpcional("A observação", LIMITE_OBSERVACAO),
});

/**
 * Comum aos dois tipos: foto e assinatura. A tela pede os dois em qualquer
 * caminho, entao eles ficam fora da uniao -- so o que **difere** entra nela.
 */
const comumDoChecklist = {
  visitaId: referencia("A visita"),
  fotos: z
    .array(caminhoDeMidia("A foto"))
    .min(MINIMO_DE_FOTOS, "Anexe ao menos uma foto.")
    .max(MAXIMO_DE_FOTOS, `Anexe no máximo ${MAXIMO_DE_FOTOS} fotos.`),
  assinaturaPath: caminhoDeMidia("A assinatura"),
};

export const esquemaDeChecklistDeVisita = z.discriminatedUnion("tipo", [
  z.object({
    ...comumDoChecklist,
    tipo: z.literal("CORRETIVA"),
    // O unico campo que a corretiva tem e a consultoria nao. Obrigatorio: e a
    // pergunta que a tela faz assim que o inspetor escolhe esta opcao.
    motivo: textoObrigatorio("O motivo da visita", LIMITE_MOTIVO),
  }),
  z.object({
    ...comumDoChecklist,
    tipo: z.literal("CONSULTORIA"),
    // Uma consultoria sem resposta nenhuma e um checklist em branco -- o
    // equivalente da "visita sem leitura" que `esquemaDeVisitaDeCampo` recusa.
    // O numero de perguntas nao e fixado aqui de proposito: sao 10 hoje, e o
    // cadastro (`perguntas_checklist`) existe justamente para isso mudar sem
    // release novo. Travar em 10 devolveria ao app a decisao que a tabela tirou.
    respostas: z
      .array(esquemaDeRespostaDoChecklist)
      .min(1, "Responda o checklist antes de enviar.")
      .refine(
        (respostas) => new Set(respostas.map((r) => r.perguntaId)).size === respostas.length,
        "A mesma pergunta foi respondida mais de uma vez.",
      ),
  }),
]);

export type RespostaDeChecklist = z.output<typeof esquemaDeRespostaDoChecklist>;
export type ChecklistDeVisita = z.output<typeof esquemaDeChecklistDeVisita>;

/**
 * Ponte com o schema do banco -- mesma funcao que `linhaDeVisita` cumpre em
 * `esquemas.ts`: anotada com `TablesInsert`, ela faz o drift de coluna quebrar
 * o `tsc --noEmit` no build em vez de o insert falhar no celular de um
 * inspetor sem sinal.
 *
 * `motivo` sai `null` na consultoria de forma explicita, e nao omitido: o
 * check do banco compara com `null`, e uma coluna omitida num caminho e um
 * `null` explicito no outro e o tipo de assimetria que so aparece em producao.
 */
export function linhaDeChecklist(
  checklist: ChecklistDeVisita,
): TablesInsert<"checklists_visita"> {
  return {
    visita_id: checklist.visitaId,
    tipo: checklist.tipo,
    motivo: checklist.tipo === "CORRETIVA" ? checklist.motivo : null,
    assinatura_path: checklist.assinaturaPath,
  };
}

export function linhasDeResposta(
  respostas: RespostaDeChecklist[],
  checklistId: number,
): TablesInsert<"checklist_respostas">[] {
  return respostas.map((resposta) => ({
    checklist_id: checklistId,
    pergunta_id: resposta.perguntaId,
    resposta: resposta.resposta,
    observacao: resposta.observacao,
  }));
}

export function linhasDeFoto(
  fotos: string[],
  checklistId: number,
): TablesInsert<"checklist_fotos">[] {
  return fotos.map((storage_path) => ({ checklist_id: checklistId, storage_path }));
}

/**
 * Monta o caminho de um arquivo no bucket.
 *
 * O nome do arquivo nasce aqui e nao no aparelho: o nome original de uma foto
 * de camera (`IMG_20260826_1.jpg`) colide entre dois inspetores no mesmo site,
 * e `storage_path` e unique na 0042. `sufixo` recebe algo unico por envio --
 * o app passa um id aleatorio.
 */
export function caminhoDeMidiaDaVisita(
  visitaId: number,
  sufixo: string,
  extensao: "jpg" | "png",
): string {
  const limpo = sufixo.replace(/[^A-Za-z0-9_-]/g, "");

  return `${visitaId}/${limpo}.${extensao}`;
}
