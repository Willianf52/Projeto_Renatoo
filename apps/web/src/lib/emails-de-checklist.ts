/**
 * Texto do e-mail ao superior quando um checklist e enviado ("Enviar E-mail
 * para o Superior?" > Checklist, migration 0068). Puro e sem I/O, como
 * `emails-de-ocorrencia.ts`: quem busca os dados e envia e
 * `fila-de-emails-de-checklist.ts`; quem decide QUEM recebe e o banco.
 */

export type DadosDoChecklist = {
  /** "CONSULTORIA" | "CORRETIVA" (0042). */
  tipo: string;
  /** Nome do modelo; nulo na corretiva. */
  modelo: string | null;
  site: string;
  funcionario: string;
  /** ISO, como vem do banco. */
  enviadoEm: string;
  /** Respostas "Nao conforme" -- o "Nao" de pergunta Sim/Nao nao conta (0061). */
  naoConformidades: number;
  /** `notaDoChecklist` do shared; nula sem o que medir. */
  nota: number | null;
  /** Motivo digitado na corretiva. */
  motivo: string | null;
  /** Link absoluto para o detalhe no Historico de Checklist. */
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

/** Quebra de linha no assunto viraria cabecalho forjado em alguns clientes. */
function umaLinha(texto: string): string {
  return texto.replace(/[\r\n]+/g, " ").trim();
}

function situacao(d: DadosDoChecklist): string {
  if (d.tipo === "CORRETIVA") return "Corretiva";
  if (d.naoConformidades === 0) return "Conforme";
  return `${d.naoConformidades} não ${d.naoConformidades === 1 ? "conformidade" : "conformidades"}`;
}

export function montarEmailDeChecklist(d: DadosDoChecklist): { assunto: string; texto: string } {
  const nomeDoChecklist = d.tipo === "CORRETIVA" ? "Corretiva" : (d.modelo ?? "Consultoria");
  const assunto = umaLinha(`Checklist enviado - ${nomeDoChecklist} - ${d.site} - ${d.funcionario}`);

  const linhas = [
    `${d.funcionario} enviou um checklist.`,
    "",
    `Checklist: ${d.tipo === "CORRETIVA" ? "Corretiva" : `Consultoria (${d.modelo ?? "sem modelo"})`}`,
    `Site: ${d.site}`,
    `Enviado em: ${DATA_HORA.format(new Date(d.enviadoEm))}`,
    `Situação: ${situacao(d)}`,
  ];
  if (d.nota !== null) linhas.push(`Nota: ${d.nota}%`);
  if (d.motivo?.trim()) linhas.push("", "Motivo:", d.motivo.trim());

  linhas.push(
    "",
    `Ver no portal: ${d.link}`,
    "",
    `Mensagem automática do Portal Operacional Up Serviços. Você recebe este aviso como superior de ${umaLinha(d.funcionario)}. Para deixar de receber, peça ao gestor que desmarque "Checklist" em "Enviar e-mail para o superior" no cadastro dessa pessoa.`,
  );

  return { assunto, texto: linhas.join("\n") };
}
