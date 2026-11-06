/**
 * O filtro de Status dos relatorios de Eventos do sistema de referencia: SO
 * cinco opcoes, com "Atendido" (o Painel de la usa "Concluido"; as duas listas
 * sao assim la). "Atendido" acha o que foi concluido, porque desde a 0094 a
 * finalizacao grava CONCLUIDO.
 */
export const OPCOES_DE_STATUS_DOS_RELATORIOS = [
  { value: "AGUARDANDO", label: "Aguardando" },
  { value: "EM_ANALISE", label: "Em Análise" },
  { value: "ATENDIDO", label: "Atendido" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CRITICO", label: "Crítico" },
];

/** Os valores de `ocorrencias.status` que a opcao escolhida alcanca. */
export function statusDaConsulta(valor: string): string[] {
  return valor === "ATENDIDO" ? ["ATENDIDO", "CONCLUIDO"] : [valor];
}
