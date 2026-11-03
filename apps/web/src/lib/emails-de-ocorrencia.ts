/**
 * Texto dos e-mails das ocorrencias (item 4 da #164). Puro e sem I/O: quem
 * busca os dados e envia e `fila-de-emails-de-ocorrencia.ts`; quem decide QUEM
 * recebe e QUANDO e o banco (migration 0065).
 *
 * Texto simples, como os demais e-mails do sistema (`lib/resend.ts`): chega
 * legivel em qualquer cliente e nao vira spam por HTML mal formado.
 */

/** ENVIO: o "Enviar Evento" do detalhe, mandado a mao por alguem (0081). */
export type Motivo = "ABERTURA" | "ANALISE" | "FINALIZACAO" | "ENVIO";

export type DadosDaMensagem = {
  motivo: Motivo;
  numero: number;
  ano: number;
  evento: string;
  site: string;
  /** ISO, como vem do banco. */
  abertaEm: string;
  /** Nulas na ocorrencia registrada a mao (Registrar Evento, 0072). */
  pergunta: string | null;
  /** "NAO" / "SIM", como gravado pela 0063. */
  resposta: string | null;
  observacao: string | null;
  /** Texto da analise ou das acoes realizadas; nulo na abertura. */
  textoDoAndamento: string | null;
  /** Link absoluto para o detalhe no portal. */
  link: string;
  /** So no ENVIO: quem mandou e o status do evento naquele momento, como
   * gravado no banco ("EM_ANALISE"). */
  remetente?: string | null;
  status?: string | null;
};

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const SITUACAO: Record<Motivo, string> = {
  ABERTURA: "Aberto",
  ANALISE: "Em análise",
  FINALIZACAO: "Finalizado",
  ENVIO: "Encaminhado",
};

const ROTULO_DO_ANDAMENTO: Record<Motivo, string | null> = {
  ABERTURA: null,
  ANALISE: "Análise",
  FINALIZACAO: "Ações realizadas",
  ENVIO: null,
};

/** Mesmos rotulos do Painel de Eventos (`painel-de-eventos/queries.ts`). */
const STATUS_LEGIVEL: Record<string, string> = {
  AGUARDANDO: "Aguardando",
  EM_ANALISE: "Em Análise",
  ATENDIDO: "Atendido",
  CANCELADO: "Cancelado",
  CRITICO: "Crítico",
};

/** Mesmo rotulo do detalhe (`painel-de-eventos/queries.ts`). */
function rotuloDaResposta(resposta: string): string {
  return resposta === "SIM" ? "Sim" : resposta === "NAO" ? "Não conforme" : resposta;
}

/** Quebra de linha no assunto viraria cabecalho forjado em alguns clientes. */
function umaLinha(texto: string): string {
  return texto.replace(/[\r\n]+/g, " ").trim();
}

export function montarEmailDeOcorrencia(d: DadosDaMensagem): { assunto: string; texto: string } {
  const assunto = umaLinha(`Evento nº ${d.numero}/${d.ano} - ${d.evento} - ${d.site} - ${SITUACAO[d.motivo]}`);

  const encaminhado = d.motivo === "ENVIO";
  const abertura = encaminhado
    ? `${d.remetente?.trim() || "Um usuário do portal"} encaminhou a você o evento nº ${d.numero}/${d.ano}.`
    : `Evento nº ${d.numero}/${d.ano}: ${SITUACAO[d.motivo].toLowerCase()}.`;

  const linhas = [
    abertura,
    "",
    `Evento: ${d.evento}`,
    `Site: ${d.site}`,
    ...(encaminhado && d.status ? [`Status: ${STATUS_LEGIVEL[d.status] ?? d.status}`] : []),
    `Aberto em: ${DATA_HORA.format(new Date(d.abertaEm))}`,
    ...(d.pergunta !== null && d.resposta !== null
      ? [`Pergunta: ${d.pergunta}`, `Resposta: ${rotuloDaResposta(d.resposta)}`]
      : ["Registrado manualmente no portal."]),
  ];
  if (d.observacao?.trim()) linhas.push(`Observação: ${d.observacao.trim()}`);

  const rotulo = ROTULO_DO_ANDAMENTO[d.motivo];
  if (rotulo && d.textoDoAndamento?.trim()) linhas.push("", `${rotulo}:`, d.textoDoAndamento.trim());

  linhas.push(
    "",
    `Ver no portal: ${d.link}`,
    "",
    // Generico de proposito: o mesmo aviso vai aos contatos do site, aos
    // e-mails do evento (0072) e ao superior de quem abriu (0068), e cada um
    // deixa de receber por um caminho diferente (o cadastro do site, o do
    // evento, ou a caixa "Evento" no cadastro do usuario) -- o gestor do
    // contrato sabe qual.
    "Mensagem automática do Portal Operacional Up Serviços. Para deixar de receber, fale com o gestor do contrato.",
  );

  return { assunto, texto: linhas.join("\n") };
}
