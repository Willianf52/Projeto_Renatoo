import { supabase } from "./supabase";

/**
 * "Checklists agendados" e "Checklists respondidos" do app de referencia.
 *
 * Os agendamentos saem da mesma funcao do portal (`agendamentos_do_periodo`,
 * 0084), que o inspetor passou a poder ler na 0088. Os respondidos sao os
 * checklists enviados de um local, os mais recentes primeiro.
 */

export type StatusDoAgendamento =
  | "FINALIZADO"
  | "FINALIZADO_COM_ATRASO"
  | "AGENDADO"
  | "NO_PRAZO"
  | "ATRASADO"
  | "NAO_REALIZADO";

/** Legenda do app antigo: Finalizado verde, Agendado amarelo; atrasado em vermelho. */
export const ROTULO_DO_STATUS: Record<StatusDoAgendamento, string> = {
  FINALIZADO: "Finalizado",
  AGENDADO: "Agendado",
  NO_PRAZO: "No prazo",
  ATRASADO: "Atrasado",
  // Os dois do portal desde a 0098 (11/11/2026).
  FINALIZADO_COM_ATRASO: "Finalizado com Atraso",
  NAO_REALIZADO: "Não Realizado",
};

export function statusDoAgendamento(valor: string): StatusDoAgendamento {
  return valor in ROTULO_DO_STATUS ? (valor as StatusDoAgendamento) : "AGENDADO";
}

export type Agendamento = {
  chave: string;
  agenda: string;
  modelo: string;
  siteId: number;
  site: string;
  dataPlanejada: string;
  prazo: string;
  status: StatusDoAgendamento;
};

export type Periodo = "hoje" | "proximos7" | "ultimos15";

export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "proximos7", rotulo: "Próximos 7 dias" },
  { valor: "ultimos15", rotulo: "Últimos 15 dias" },
];

function diaLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** As datas (aaaa-mm-dd, no fuso do aparelho) de cada periodo. Pura. */
export function datasDoPeriodo(periodo: Periodo, hoje: Date = new Date()): { inicio: string; fim: string } {
  const mais = (dias: number) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() + dias);
    return diaLocal(d);
  };
  if (periodo === "hoje") return { inicio: mais(0), fim: mais(0) };
  if (periodo === "proximos7") return { inicio: mais(0), fim: mais(7) };
  return { inicio: mais(-15), fim: mais(0) };
}

/** dd/mm/aaaa de uma data aaaa-mm-dd, sem passar por Date (sem fuso). */
export function dataBr(valor: string): string {
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

type LinhaDoAgendamento = {
  agenda_id: number;
  agenda: string;
  modelo: string;
  site_id: number;
  data_planejada: string;
  prazo: string;
  status: string;
};

export async function lerAgendamentos(
  periodo: Periodo,
  siteId: number | null,
): Promise<{ ok: true; lista: Agendamento[] } | { ok: false; erro: string }> {
  const { inicio, fim } = datasDoPeriodo(periodo);
  try {
    const { data, error } = await supabase.rpc("agendamentos_do_periodo", { p_inicio: inicio, p_fim: fim });
    if (error) return { ok: false, erro: "Não foi possível carregar os agendamentos. Verifique a conexão." };
    const linhas = ((data ?? []) as unknown as LinhaDoAgendamento[]).filter(
      (l) => siteId === null || l.site_id === siteId,
    );
    const ids = [...new Set(linhas.map((l) => l.site_id))];
    const nomes = new Map<number, string>();
    if (ids.length > 0) {
      const { data: sites } = await supabase.from("sites").select("id, nome").in("id", ids);
      for (const s of sites ?? []) nomes.set(s.id, s.nome);
    }
    const lista = linhas
      .map((l) => ({
        chave: `${l.agenda_id}-${l.site_id}-${l.data_planejada}`,
        agenda: l.agenda,
        modelo: l.modelo,
        siteId: l.site_id,
        site: nomes.get(l.site_id) ?? `Site ${l.site_id}`,
        dataPlanejada: l.data_planejada,
        prazo: l.prazo,
        status: statusDoAgendamento(l.status),
      }))
      .sort((a, b) => a.dataPlanejada.localeCompare(b.dataPlanejada) || a.site.localeCompare(b.site, "pt-BR"));
    return { ok: true, lista };
  } catch {
    return { ok: false, erro: "Não foi possível carregar os agendamentos. Verifique a conexão." };
  }
}

export type ChecklistRespondido = {
  id: number;
  numeroAno: string;
  modelo: string;
  tipo: string;
  quando: string;
};

/** dd/mm/aaaa hh:mm no fuso do aparelho. */
function dataEHora(valor: string): string {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function lerRespondidos(
  siteId: number,
): Promise<{ ok: true; lista: ChecklistRespondido[] } | { ok: false; erro: string }> {
  try {
    const { data, error } = await supabase
      .from("checklists_visita")
      .select("id, numero, ano, tipo, criado_em, modelos_checklist ( nome ), visitas!inner ( site_id )")
      .eq("visitas.site_id", siteId)
      .order("criado_em", { ascending: false })
      .limit(30);
    if (error) return { ok: false, erro: "Não foi possível carregar os checklists respondidos. Verifique a conexão." };
    return {
      ok: true,
      lista: (data ?? []).map((c) => ({
        id: c.id,
        numeroAno: `${String(c.numero).padStart(5, "0")}/${c.ano}`,
        modelo: c.modelos_checklist?.nome ?? (c.tipo === "CORRETIVA" ? "Visita corretiva" : "Checklist"),
        tipo: c.tipo,
        quando: dataEHora(c.criado_em),
      })),
    };
  } catch {
    return { ok: false, erro: "Não foi possível carregar os checklists respondidos. Verifique a conexão." };
  }
}
