import type { TipoDeVisita } from "@projeto-renatoo/shared";

/**
 * O que ainda falta para fechar o checklist, na ordem em que aparece na tela.
 *
 * Existe fora da `TelaDeChecklist` porque a mesma resposta serve a tres
 * lugares que precisam concordar: a validacao do "Finalizar", o destino da
 * rolagem quando ela falha e o resumo do rodape fixo. Com a regra escrita uma
 * vez so, o rodape nao tem como dizer "Tudo pronto" enquanto o botao recusa o
 * envio -- e, sendo funcao pura, e a parte da tela que o vitest alcanca (ver a
 * nota em `vitest.config.mts` sobre componente RN).
 *
 * A assinatura entra aqui pelo `temAssinatura` da tela. A captura do traco
 * (`capturar()`) continua no envio: ela pode falhar com a assinatura na tela,
 * e esse caso nao e "pendencia" do inspetor.
 */
export type EstadoDoChecklist = {
  tipo: TipoDeVisita;
  motivo: string;
  /** `null` e "ainda carregando", como na tela. */
  perguntas: readonly { id: number }[] | null;
  respostas: Readonly<Record<number, unknown>>;
  /**
   * O grupo do site tem mais de um modelo e o inspetor ainda nao escolheu
   * (0061). Enquanto isso nao ha lista de perguntas para responder.
   */
  escolhaDeModeloPendente?: boolean;
  /** Gerais e de pergunta, somadas: qualquer uma comprova a visita. */
  quantidadeDeFotos: number;
  temAssinatura: boolean;
};

export type Pendencia =
  | { alvo: "motivo"; mensagem: string }
  | {
      alvo: "perguntas";
      /** A primeira sem resposta, para onde a tela rola. `null` sem lista. */
      perguntaId: number | null;
      /** `null` quando nao ha lista para contar (carregando ou vazia). */
      faltam: number | null;
      mensagem: string;
    }
  | { alvo: "fotos"; mensagem: string }
  | { alvo: "assinatura"; mensagem: string };

export function pendenciasDoChecklist(estado: EstadoDoChecklist): Pendencia[] {
  const pendencias: Pendencia[] = [];

  if (estado.tipo === "CORRETIVA" && estado.motivo.trim() === "") {
    pendencias.push({ alvo: "motivo", mensagem: "Informe o motivo da visita." });
  }

  if (estado.tipo === "CONSULTORIA") {
    const pendenciaDePerguntas = pendenciaDasPerguntas(estado);
    if (pendenciaDePerguntas) pendencias.push(pendenciaDePerguntas);
  }

  if (estado.quantidadeDeFotos === 0) {
    pendencias.push({ alvo: "fotos", mensagem: "Anexe ao menos uma foto." });
  }

  if (!estado.temAssinatura) {
    pendencias.push({ alvo: "assinatura", mensagem: "Colha a assinatura do responsável." });
  }

  return pendencias;
}

function pendenciaDasPerguntas(estado: EstadoDoChecklist): Pendencia | null {
  // Antes de "carregando": sem modelo escolhido as perguntas nem comecam a
  // carregar, e "aguarde" mandaria o inspetor esperar por algo que so ele
  // pode destravar.
  if (estado.escolhaDeModeloPendente) {
    return {
      alvo: "perguntas",
      perguntaId: null,
      faltam: null,
      mensagem: "Escolha qual checklist responder.",
    };
  }

  if (estado.perguntas === null) {
    // Antes caia no "Nenhuma pergunta cadastrada" -- falso enquanto a lista
    // ainda esta a caminho, e o inspetor ia atras de um problema que nao ha.
    return {
      alvo: "perguntas",
      perguntaId: null,
      faltam: null,
      mensagem: "Aguarde as perguntas do checklist carregarem.",
    };
  }

  if (estado.perguntas.length === 0) {
    return {
      alvo: "perguntas",
      perguntaId: null,
      faltam: null,
      mensagem: "Nenhuma pergunta cadastrada no checklist.",
    };
  }

  const semResposta = estado.perguntas.filter((pergunta) => !estado.respostas[pergunta.id]);
  if (semResposta.length === 0) return null;

  return {
    alvo: "perguntas",
    perguntaId: semResposta[0].id,
    faltam: semResposta.length,
    mensagem: `Responda todas as perguntas (faltam ${semResposta.length}).`,
  };
}

/** Barra do rodape. `null` fora da consultoria ou sem lista para medir. */
export function progressoDasPerguntas(
  estado: EstadoDoChecklist,
): { respondidas: number; total: number } | null {
  if (estado.tipo !== "CONSULTORIA" || !estado.perguntas || estado.perguntas.length === 0) {
    return null;
  }

  const respondidas = estado.perguntas.filter((pergunta) => estado.respostas[pergunta.id]).length;
  return { respondidas, total: estado.perguntas.length };
}

/**
 * Uma linha para o rodape: o que falta, em vez de so "quantos". "Falta:" com
 * dois-pontos, e nao "Falta"/"Faltam" concordando com o primeiro item -- a
 * lista muda a cada toque e a frase trocaria de verbo sob o dedo.
 */
export function textoDoResumo(pendencias: readonly Pendencia[]): string {
  if (pendencias.length === 0) return "Tudo pronto para enviar.";

  const pecas = pendencias.map(pecaDoResumo);
  const lista =
    pecas.length === 1 ? pecas[0] : `${pecas.slice(0, -1).join(", ")} e ${pecas[pecas.length - 1]}`;

  return `Falta: ${lista}.`;
}

function pecaDoResumo(pendencia: Pendencia): string {
  switch (pendencia.alvo) {
    case "motivo":
      return "o motivo";
    case "perguntas":
      if (pendencia.faltam === null) return "as perguntas";
      return pendencia.faltam === 1 ? "1 pergunta" : `${pendencia.faltam} perguntas`;
    case "fotos":
      return "uma foto";
    case "assinatura":
      return "a assinatura";
  }
}
