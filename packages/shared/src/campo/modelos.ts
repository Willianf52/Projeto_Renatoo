import { ROTULO_DA_RESPOSTA, type RespostaDoChecklist } from "./checklist";

/**
 * Modelos de checklist (migration 0061): cada grupo de sites responde a sua
 * lista de perguntas, e cada pergunta tem um tipo de resposta.
 *
 * Fonte unica, como o resto de `campo/`: o app decide que botoes desenhar e o
 * painel decide como mostrar a resposta com as MESMAS funcoes -- senao o
 * inspetor responderia "Sim" e o relatorio leria "Conforme".
 */

/**
 * CNA = Conforme / Nao conforme / Nao se aplica; CN = sem o "Nao se aplica";
 * SN = Sim / Nao. Os tres conjuntos que o sistema de referencia usava -- o
 * levantamento de 30/09/2026 nao achou um quarto.
 */
export const TIPOS_DE_RESPOSTA = ["CNA", "CN", "SN"] as const;
export type TipoDeResposta = (typeof TIPOS_DE_RESPOSTA)[number];

export const ROTULO_DO_TIPO_DE_RESPOSTA: Record<TipoDeResposta, string> = {
  CNA: "Conforme / Não conforme / Não se aplica",
  CN: "Conforme / Não conforme",
  SN: "Sim / Não",
};

/** O banco guarda `tipo_resposta` como texto; valor fora da lista cai no CNA,
 * que e o tipo de toda pergunta anterior a 0061. */
export function tipoDeResposta(valor: string | null | undefined): TipoDeResposta {
  return (TIPOS_DE_RESPOSTA as readonly string[]).includes(valor ?? "")
    ? (valor as TipoDeResposta)
    : "CNA";
}

/**
 * Quais respostas a pergunta aceita, na ordem dos botoes. Espelha o trigger
 * `validar_resposta_do_checklist` da 0061: "Nao se aplica" so no CNA.
 */
export function respostasDoTipo(tipo: TipoDeResposta): readonly RespostaDoChecklist[] {
  return tipo === "CNA" ? ["SIM", "NAO", "NA"] : ["SIM", "NAO"];
}

/**
 * O valor gravado e sempre SIM/NAO/NA (0061 nao reescreveu resposta nenhuma);
 * o que muda com o tipo e so o texto. Num Sim/Nao, SIM e "Sim" -- e nao
 * "Conforme", que diria que ter duvida com o RH esta conforme.
 */
export function rotuloDaResposta(tipo: TipoDeResposta, resposta: RespostaDoChecklist): string {
  if (tipo === "SN") return resposta === "SIM" ? "Sim" : resposta === "NAO" ? "Não" : "Não se aplica";
  return ROTULO_DA_RESPOSTA[resposta];
}

/**
 * Nota de 0 a 100: a fatia de "Conforme" entre as perguntas de conformidade
 * respondidas.
 *
 * Ficam de fora, e por isso nao pesam contra nem a favor:
 *   - "Nao se aplica" -- o item nao existe no local;
 *   - perguntas Sim/Nao -- "Duvidas com o RH?" nao e conformidade: um "Sim"
 *     ali nao e defeito do posto, e um "Nao" nao e merito.
 *
 * `null` quando nao sobra pergunta nenhuma para medir (checklist so de Sim/Nao
 * ou todo "Nao se aplica"). Zero ali seria mentira: nada foi reprovado.
 *
 * Calculada, e nao guardada, por decisao de 30/09/2026: e funcao pura das
 * respostas, entao nao ha coluna para ficar desencontrada delas.
 */
export function notaDoChecklist(
  respostas: readonly { tipo: TipoDeResposta; resposta: RespostaDoChecklist }[],
): number | null {
  let medidas = 0;
  let conformes = 0;

  for (const { tipo, resposta } of respostas) {
    if (tipo === "SN" || resposta === "NA") continue;
    medidas += 1;
    if (resposta === "SIM") conformes += 1;
  }

  return medidas === 0 ? null : Math.round((conformes / medidas) * 100);
}

export type ModeloResumido = { id: number; nome: string; padrao: boolean; ativo: boolean };
export type LigacaoDeModelo = { modelo_id: number; grupo_site_id: number };

/**
 * Os modelos que um site responde, pelo grupo dele.
 *
 * Os ativos ligados ao grupo, por nome; se nao houver nenhum, o PADRAO --
 * decisao do dono: grupo sem modelo nao fica sem checklist. Lista vazia so
 * se nem o padrao vier (leitura falhou), e a tela trata isso como erro.
 */
export function modelosDoGrupo(
  grupoSiteId: number,
  modelos: readonly ModeloResumido[],
  ligacoes: readonly LigacaoDeModelo[],
): ModeloResumido[] {
  const ligados = new Set(
    ligacoes.filter((ligacao) => ligacao.grupo_site_id === grupoSiteId).map((ligacao) => ligacao.modelo_id),
  );

  const doGrupo = modelos
    .filter((modelo) => modelo.ativo && ligados.has(modelo.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  if (doGrupo.length > 0) return doGrupo;

  return modelos.filter((modelo) => modelo.padrao && modelo.ativo);
}
