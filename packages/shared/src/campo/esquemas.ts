import { z } from "zod";
import type { TablesInsert } from "../database-types";
import { LIMITE_OBSERVACAO, normalizarInstante, temCoordenada } from "./regras";

/**
 * Contrato do formulario de inspecao: uma visita e as leituras registradas
 * nela. E o que o app dos inspetores envia e o que o painel web precisa
 * aceitar sem reimplementar regra nenhuma.
 *
 * Referencias por **id**, nao por nome -- diferente do lote da rota de
 * importacao (`src/lib/importar-coletas.ts`), que recebe nome porque quem
 * exporta de um sistema de terceiros nao conhece os ids internos. O app
 * conhece: ele sincroniza os cadastros (areas, eventos, acoes,
 * qualificadores) antes de ir a campo. Aceitar nome aqui reintroduziria a
 * ambiguidade que `resolverReferencia` existe para recusar.
 *
 * O esquema **normaliza** alem de validar: string vazia vira `null`, texto
 * perde espaco das bordas e todo instante sai em UTC. Assim o dado que sai
 * do `parse` ja e o dado que entra no banco, e nao ha uma segunda etapa de
 * "limpeza" para o web e o mobile divergirem.
 */

const referencia = (rotulo: string) =>
  z
    .number({ error: `${rotulo} deve ser um número.` })
    .int(`${rotulo} deve ser um número inteiro.`)
    .positive(`${rotulo} deve ser um número positivo.`);

/**
 * FK opcional. Ausente, `null` e nao informado sao a mesma coisa: o
 * dispositivo legitimamente nao preencheu o campo. Colapsar os tres em
 * `null` aqui evita que `undefined` chegue ao banco como "coluna omitida"
 * num caminho e como `null` explicito no outro.
 */
const referenciaOpcional = (rotulo: string) =>
  referencia(rotulo)
    .nullish()
    .transform((valor) => valor ?? null);

const textoOpcional = (rotulo: string, limite: number) =>
  z
    .string({ error: `${rotulo} deve ser texto.` })
    .trim()
    .max(limite, `${rotulo} deve ter no máximo ${limite} caracteres.`)
    .nullish()
    .transform((valor) => (valor === undefined || valor === null || valor === "" ? null : valor));

/**
 * Instante obrigatorio, com fuso, devolvido em UTC. A regra em si mora em
 * `regras.ts`; aqui so a traducao do motivo para a mensagem que o inspetor
 * le na tela.
 */
const instanteObrigatorio = (rotulo: string) =>
  z
    .string({ error: `${rotulo} é obrigatório.` })
    .min(1, `${rotulo} é obrigatório.`)
    .transform((valor, ctx) => {
      const resultado = normalizarInstante(valor);

      if (!resultado.ok) {
        ctx.addIssue({
          code: "custom",
          message:
            resultado.motivo === "sem-fuso"
              ? `${rotulo} precisa terminar com o fuso (ex: 2026-08-01T08:12:00-03:00).`
              : `${rotulo} não é uma data/hora válida.`,
        });
        return z.NEVER;
      }

      return resultado.iso;
    });

/**
 * Coordenada aceita como qualquer coisa de proposito: o valor nao e guardado
 * desde a migration 0022, so a presenca dele vira `tem_localizacao` (0023).
 * Validar formato aqui recusaria um envio por causa de um campo que o
 * sistema declarou nao usar.
 */
const coordenada = z.unknown().optional();

export const esquemaDeLeituraDeCampo = z
  .object({
    dataHora: instanteObrigatorio("A data/hora da leitura"),
    areaId: referenciaOpcional("A área"),
    qrCodeId: referenciaOpcional("O QR Code"),
    eventoId: referenciaOpcional("O evento"),
    acaoId: referenciaOpcional("A ação"),
    qualificadorId: referenciaOpcional("O qualificador"),
    observacao: textoOpcional("A observação", LIMITE_OBSERVACAO),
    latitude: coordenada,
    longitude: coordenada,
  })
  .transform(({ latitude, longitude, ...leitura }) => ({
    ...leitura,
    // Exige as duas: uma coordenada sozinha nao localiza nada, e tratar isso
    // como "tem localizacao" faria o filtro Com/Sem Localizacao da tela
    // mentir sobre uma leitura que nunca teve ponto.
    temLocalizacao: temCoordenada(latitude) && temCoordenada(longitude),
  }));

export const esquemaDeVisitaDeCampo = z.object({
  numeroColeta: referencia("O número da coleta"),
  siteId: referencia("O site"),
  funcionarioId: z
    .uuid("O funcionário informado é inválido.")
    .nullish()
    .transform((valor) => valor ?? null),
  motivoVisitaId: referenciaOpcional("O motivo da visita"),
  coletorDadosId: referenciaOpcional("O coletor de dados"),
  // Uma visita sem leitura nenhuma nao e uma inspecao -- e um registro vazio
  // que so ocupa a contagem da meta do site (`metas_visitas`).
  leituras: z
    .array(esquemaDeLeituraDeCampo)
    .min(1, "Registre ao menos uma leitura na visita."),
});

export type LeituraDeCampo = z.output<typeof esquemaDeLeituraDeCampo>;
export type VisitaDeCampo = z.output<typeof esquemaDeVisitaDeCampo>;

/**
 * Ponte com o schema do banco. Estas duas funcoes sao o que impede o drift
 * de tipos de virar bug em producao: elas sao anotadas com `TablesInsert`,
 * que vem de `database.types.ts` (gerado por `pnpm run types:generate`).
 * Se uma coluna mudar de nome, de tipo ou de nulidade e ninguem atualizar o
 * esquema acima, o `tsc --noEmit` quebra **aqui**, no build -- em vez de o
 * insert falhar em campo, no celular de um inspetor sem sinal.
 */
export function linhaDeVisita(visita: VisitaDeCampo): TablesInsert<"visitas"> {
  return {
    numero_coleta: visita.numeroColeta,
    site_id: visita.siteId,
    funcionario_id: visita.funcionarioId,
    motivo_visita_id: visita.motivoVisitaId,
    coletor_dados_id: visita.coletorDadosId,
  };
}

export function linhaDeLeitura(leitura: LeituraDeCampo, visitaId: number): TablesInsert<"leituras"> {
  return {
    visita_id: visitaId,
    data_hora: leitura.dataHora,
    area_id: leitura.areaId,
    qr_code_id: leitura.qrCodeId,
    evento_id: leitura.eventoId,
    acao_id: leitura.acaoId,
    qualificador_id: leitura.qualificadorId,
    observacao: leitura.observacao,
    tem_localizacao: leitura.temLocalizacao,
  };
}
