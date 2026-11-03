/**
 * Regras puras da "Criar Agenda" e dos "Agendamentos" (migration 0084), sem
 * banco -- o que o vitest alcanca.
 */

export const LISTAGEM = "/dashboard/checklistlab/agendas";
export const AGENDAMENTOS = "/dashboard/checklistlab/agendamentos";

/** Os "Padroes de Recorrencia" do sistema de referencia (CHECK da 0084). */
export const RECORRENCIAS = [
  { value: "DIARIO", label: "Diário", dias: 1, meses: 0 },
  { value: "SEMANAL", label: "Semanal", dias: 7, meses: 0 },
  { value: "QUINZENAL", label: "Quinzenal", dias: 14, meses: 0 },
  { value: "MENSAL", label: "Mensal", dias: 0, meses: 1 },
  { value: "BIMESTRAL", label: "Bimestral", dias: 0, meses: 2 },
  { value: "TRIMESTRAL", label: "Trimestral", dias: 0, meses: 3 },
  { value: "SEMESTRAL", label: "Semestral", dias: 0, meses: 6 },
  { value: "ANUAL", label: "Anual", dias: 0, meses: 12 },
] as const;

export type Recorrencia = (typeof RECORRENCIAS)[number]["value"];

export function rotuloDaRecorrencia(valor: string): string {
  return RECORRENCIAS.find((r) => r.value === valor)?.label ?? valor;
}

/** Os status do "Agendamentos" do sistema de referencia. */
export const STATUS_DO_AGENDAMENTO = [
  { value: "AGENDADO", label: "Agendado", cor: "bg-slate-500" },
  { value: "NO_PRAZO", label: "No prazo", cor: "bg-amber-500" },
  { value: "ATRASADO", label: "Atrasado", cor: "bg-red-600" },
  { value: "FINALIZADO", label: "Finalizado", cor: "bg-emerald-600" },
] as const;

export function rotuloDoStatus(valor: string): string {
  return STATUS_DO_AGENDAMENTO.find((s) => s.value === valor)?.label ?? valor;
}

export function corDoStatus(valor: string): string {
  return STATUS_DO_AGENDAMENTO.find((s) => s.value === valor)?.cor ?? "bg-slate-600";
}

/**
 * Quantas datas a recorrencia gera entre as duas datas -- a coluna
 * "Agendamentos" da lista (por site). Mesma conta do `generate_series` da
 * 0084: soma dias ou meses a partir da data inicial.
 */
export function quantidadeDeDatas(dataInicial: string, dataFinal: string, recorrencia: string): number {
  const passo = RECORRENCIAS.find((r) => r.value === recorrencia);
  if (!passo) return 0;
  const inicio = new Date(`${dataInicial}T12:00:00Z`);
  const fim = new Date(`${dataFinal}T12:00:00Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) return 0;
  let n = 0;
  for (let i = 0; i < 2000; i += 1) {
    const d = new Date(inicio);
    if (passo.dias) d.setUTCDate(d.getUTCDate() + passo.dias * i);
    else d.setUTCMonth(d.getUTCMonth() + passo.meses * i);
    if (d > fim) break;
    n += 1;
  }
  return n;
}

const ID = /^[1-9]\d{0,17}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export type ValoresDaAgenda = {
  nome: string;
  modeloId: string;
  responsavelId: string;
  grupoUsuarioId: string;
  dataInicial: string;
  dataFinal: string;
  recorrencia: string;
  toleranciaDias: string;
  ativo: boolean;
  sites: string[];
};

export type AgendaParaGravar = {
  nome: string;
  modeloId: number;
  responsavelId: string | null;
  grupoUsuarioId: number | null;
  dataInicial: string;
  dataFinal: string;
  recorrencia: Recorrencia;
  toleranciaDias: number;
  ativo: boolean;
  sites: number[];
};

/** Confere o formulario; o banco confere de novo (CHECK e RLS da 0084). */
export function validarAgenda(v: ValoresDaAgenda): { ok: true; agenda: AgendaParaGravar } | { ok: false; erro: string } {
  const nome = v.nome.replace(/\s+/g, " ").trim();
  if (!nome) return { ok: false, erro: "Informe o nome da agenda." };
  if (nome.length > 100) return { ok: false, erro: "O nome deve ter no máximo 100 caracteres." };
  if (!ID.test(v.modeloId)) return { ok: false, erro: "Escolha o checklist." };
  if (v.responsavelId && !UUID.test(v.responsavelId)) return { ok: false, erro: "Responsável inválido." };
  if (v.grupoUsuarioId && !ID.test(v.grupoUsuarioId)) return { ok: false, erro: "Grupo de usuários inválido." };
  if (!dataValida(v.dataInicial)) return { ok: false, erro: "Informe a data inicial." };
  if (!dataValida(v.dataFinal)) return { ok: false, erro: "Informe a data final." };
  if (v.dataFinal < v.dataInicial) return { ok: false, erro: "A data final não pode ser antes da inicial." };
  const dias = (Date.parse(`${v.dataFinal}T12:00:00Z`) - Date.parse(`${v.dataInicial}T12:00:00Z`)) / 86_400_000;
  if (dias > 1830) return { ok: false, erro: "O período da agenda pode ter no máximo 5 anos." };
  const recorrencia = RECORRENCIAS.find((r) => r.value === v.recorrencia);
  if (!recorrencia) return { ok: false, erro: "Escolha o padrão de recorrência." };
  const tolerancia = v.toleranciaDias.trim() === "" ? 0 : Number(v.toleranciaDias);
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 365) {
    return { ok: false, erro: "A tolerância deve ser um número de dias entre 0 e 365." };
  }
  const sites = Array.from(new Set(v.sites));
  if (sites.length === 0) return { ok: false, erro: "Escolha ao menos um site." };
  if (!sites.every((s) => ID.test(s))) return { ok: false, erro: "Site inválido." };

  return {
    ok: true,
    agenda: {
      nome,
      modeloId: Number(v.modeloId),
      responsavelId: v.responsavelId || null,
      grupoUsuarioId: v.grupoUsuarioId ? Number(v.grupoUsuarioId) : null,
      dataInicial: v.dataInicial,
      dataFinal: v.dataFinal,
      recorrencia: recorrencia.value,
      toleranciaDias: tolerancia,
      ativo: v.ativo,
      sites: sites.map(Number),
    },
  };
}
