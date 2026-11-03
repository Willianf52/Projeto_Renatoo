import { dataValida } from "@/lib/data-hora";
import { filtroDeId, filtroDeUuid } from "@/lib/id-na-url";
import { createClient } from "@/lib/supabase/server";
import { STATUS_DO_AGENDAMENTO } from "../agendas/regras";

/**
 * "Agendamentos" do ChecklistLab (0084): as datas planejadas das agendas, por
 * site, com o status calculado no banco (`agendamentos_do_periodo`).
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export function primeiro(valor: string | string[] | undefined): string | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) || undefined;
}

export const PAGE_SIZE = 25;

export type Filtros = {
  dataInicial: string;
  dataFinal: string;
  agenda?: string;
  modelo?: string;
  site?: string;
  responsavel?: string;
  status?: string;
  pagina: number;
};

/** Sem periodo: de 30 dias atras a 30 dias a frente, no horario de Brasilia. */
export function periodoPadrao(agora: Date): { dataInicial: string; dataFinal: string } {
  const hoje = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia = 24 * 60 * 60 * 1000;
  return {
    dataInicial: new Date(hoje.getTime() - 30 * dia).toISOString().slice(0, 10),
    dataFinal: new Date(hoje.getTime() + 30 * dia).toISOString().slice(0, 10),
  };
}

export function extrairFiltros(params: SearchParams, agora: Date): Filtros {
  const padrao = periodoPadrao(agora);
  const status = primeiro(params.status);
  const pagina = Number(primeiro(params.pagina));
  return {
    dataInicial: dataValida(primeiro(params.data_inicial)) ?? padrao.dataInicial,
    dataFinal: dataValida(primeiro(params.data_final)) ?? padrao.dataFinal,
    agenda: filtroDeId(primeiro(params.agenda)),
    modelo: filtroDeId(primeiro(params.modelo)),
    site: filtroDeId(primeiro(params.site)),
    responsavel: filtroDeUuid(primeiro(params.responsavel)),
    status: STATUS_DO_AGENDAMENTO.some((s) => s.value === status) ? status : undefined,
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

export type Agendamento = {
  agendaId: number;
  agenda: string;
  modelo: string;
  siteId: number;
  site: string;
  dataPlanejada: string;
  prazo: string;
  responsavel: string;
  status: string;
  checklistId: number | null;
  realizadoEm: string | null;
};

type LinhaDoBanco = {
  agenda_id: number;
  agenda: string;
  modelo_id: number;
  modelo: string;
  site_id: number;
  data_planejada: string;
  prazo: string;
  responsavel_id: string | null;
  checklist_id: number | null;
  realizado_em: string | null;
  status: string;
};

/** Todos os agendamentos do filtro (sao poucos: agendas x datas x sites). */
export async function getAgendamentos(filtros: Filtros): Promise<Agendamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agendamentos_do_periodo", {
    p_inicio: filtros.dataInicial,
    p_fim: filtros.dataFinal,
  });
  if (error) throw error;

  const linhas = ((data ?? []) as unknown as LinhaDoBanco[]).filter(
    (l) =>
      (!filtros.agenda || String(l.agenda_id) === filtros.agenda) &&
      (!filtros.modelo || String(l.modelo_id) === filtros.modelo) &&
      (!filtros.site || String(l.site_id) === filtros.site) &&
      (!filtros.responsavel || l.responsavel_id === filtros.responsavel) &&
      (!filtros.status || l.status === filtros.status),
  );

  const siteIds = [...new Set(linhas.map((l) => l.site_id))];
  const pessoas = [...new Set(linhas.map((l) => l.responsavel_id).filter((v): v is string => Boolean(v)))];
  const [sites, perfis] = await Promise.all([
    siteIds.length ? supabase.from("sites").select("id, nome").in("id", siteIds) : Promise.resolve({ data: [] }),
    pessoas.length
      ? supabase.from("profiles").select("id, nome_completo").in("id", pessoas)
      : Promise.resolve({ data: [] }),
  ]);
  const nomeDoSite = new Map(((sites.data ?? []) as { id: number; nome: string }[]).map((s) => [s.id, s.nome]));
  const nomeDaPessoa = new Map(
    ((perfis.data ?? []) as { id: string; nome_completo: string | null }[]).map((p) => [p.id, p.nome_completo ?? ""]),
  );

  return linhas.map((l) => ({
    agendaId: l.agenda_id,
    agenda: l.agenda,
    modelo: l.modelo,
    siteId: l.site_id,
    site: nomeDoSite.get(l.site_id) ?? `Site ${l.site_id}`,
    dataPlanejada: l.data_planejada,
    prazo: l.prazo,
    responsavel: l.responsavel_id ? (nomeDaPessoa.get(l.responsavel_id) ?? "") : "",
    status: l.status,
    checklistId: l.checklist_id,
    realizadoEm: l.realizado_em,
  }));
}

export type OpcoesDosFiltros = { agendas: Opcao[]; modelos: Opcao[]; sites: Opcao[]; usuarios: Opcao[] };
type Opcao = { value: string; label: string };

export async function getOpcoesDosFiltros(): Promise<OpcoesDosFiltros> {
  const supabase = await createClient();
  const [agendas, modelos, sites, usuarios] = await Promise.all([
    supabase.from("agendas").select("id, nome").order("nome"),
    supabase.from("modelos_checklist").select("id, nome").order("nome"),
    supabase.from("sites").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("profiles").select("id, nome_completo").eq("ativo", true).order("nome_completo"),
  ]);
  return {
    agendas: (agendas.data ?? []).map((a) => ({ value: String(a.id), label: a.nome })),
    modelos: (modelos.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
    sites: (sites.data ?? []).map((s) => ({ value: String(s.id), label: s.nome })),
    usuarios: (usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome_completo ?? "" })),
  };
}
