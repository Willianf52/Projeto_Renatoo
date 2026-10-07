/**
 * Texto dos e-mails das ocorrencias (item 4 da #164). Puro e sem I/O: quem
 * busca os dados e envia e `fila-de-emails-de-ocorrencia.ts`; quem decide QUEM
 * recebe e QUANDO e o banco (migration 0065).
 *
 * Texto simples, como os demais e-mails do sistema (`lib/resend.ts`): chega
 * legivel em qualquer cliente e nao vira spam por HTML mal formado.
 */

export type Motivo = "ABERTURA" | "ANALISE" | "FINALIZACAO";

export type DadosDaMensagem = {
  motivo: Motivo;
  numero: number;
  ano: number;
  evento: string;
  site: string;
  /** ISO, como vem do banco. */
  abertaEm: string;
  pergunta: string;
  /** "NAO" / "SIM", como gravado pela 0063. */
  resposta: string;
  observacao: string | null;
  /** Texto da analise ou das acoes realizadas; nulo na abertura. */
  textoDoAndamento: string | null;
  /** Link absoluto para o detalhe no portal. */
  link: string;
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
};

const ROTULO_DO_ANDAMENTO: Record<Motivo, string | null> = {
  ABERTURA: null,
  ANALISE: "Análise",
  FINALIZACAO: "Ações realizadas",
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

  const linhas = [
    `Evento nº ${d.numero}/${d.ano}: ${SITUACAO[d.motivo].toLowerCase()}.`,
    "",
    `Evento: ${d.evento}`,
    `Site: ${d.site}`,
    `Aberto em: ${DATA_HORA.format(new Date(d.abertaEm))}`,
    `Pergunta: ${d.pergunta}`,
    `Resposta: ${rotuloDaResposta(d.resposta)}`,
  ];
  if (d.observacao?.trim()) linhas.push(`Observação: ${d.observacao.trim()}`);

  const rotulo = ROTULO_DO_ANDAMENTO[d.motivo];
  if (rotulo && d.textoDoAndamento?.trim()) linhas.push("", `${rotulo}:`, d.textoDoAndamento.trim());

  linhas.push(
    "",
    `Ver no portal: ${d.link}`,
    "",
    // Generico de proposito: desde a 0068 o mesmo aviso vai aos contatos do
    // site E ao superior de quem abriu, e cada um deixa de receber por um
    // caminho diferente (o cadastro do site, ou a caixa "Evento" no cadastro
    // do usuario) -- o gestor do contrato sabe qual.
    "Mensagem automática do Portal Operacional Up Serviços. Para deixar de receber, fale com o gestor do contrato.",
  );

  return { assunto, texto: linhas.join("\n") };
}
