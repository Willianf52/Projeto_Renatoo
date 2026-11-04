/**
 * Os status das ocorrencias, sem dependencia de servidor: o Quadro
 * arrastavel (cliente) e as consultas usam a mesma lista.
 */

export type Status =
  | "AGUARDANDO"
  | "EM_ANALISE"
  | "ATENDIDO"
  | "CANCELADO"
  | "CRITICO"
  | "CONCLUIDO"
  | "NAO_REALIZADO"
  | "PRE_CRITICO"
  | "ALERTA"
  | "PANICO";

/**
 * Os status que o banco aceita (0063, e os cinco que faltavam na 0089), na
 * ordem do sistema de referencia.
 */
export const STATUS: { value: Status; label: string; cor: string; anel: string }[] = [
  { value: "AGUARDANDO", label: "Aguardando", cor: "bg-red-600", anel: "#dc2626" },
  { value: "EM_ANALISE", label: "Em Análise", cor: "bg-amber-500", anel: "#f59e0b" },
  { value: "ATENDIDO", label: "Atendido", cor: "bg-emerald-600", anel: "#059669" },
  { value: "CONCLUIDO", label: "Concluído", cor: "bg-teal-600", anel: "#0d9488" },
  { value: "NAO_REALIZADO", label: "Não Realizado", cor: "bg-stone-500", anel: "#78716c" },
  { value: "CANCELADO", label: "Cancelado", cor: "bg-slate-500", anel: "#64748b" },
  { value: "PRE_CRITICO", label: "Pré-crítico", cor: "bg-orange-600", anel: "#ea580c" },
  { value: "CRITICO", label: "Crítico", cor: "bg-fuchsia-700", anel: "#a21caf" },
  { value: "ALERTA", label: "Alerta", cor: "bg-yellow-500", anel: "#eab308" },
  { value: "PANICO", label: "Pânico", cor: "bg-rose-800", anel: "#9f1239" },
];

export function rotuloDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.label ?? status;
}

export function anelDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.anel ?? "#475569";
}

export function corDoStatus(status: string): string {
  return STATUS.find((s) => s.value === status)?.cor ?? "bg-slate-600";
}
